"""
Actor LoginInfo Test Suite

Tests the LoginInfo system including:
- Password management
- OTP generation and verification
- Session management
- Account locking
- Actor integration
"""
import pytest
import time
from src.monkey_brain.kernel.login_info import (
    LoginInfo, PasswordInfo, OTPInfo, SessionInfo,
    AuthMethod, AccountStatus, OTPStatus,
)
from src.monkey_brain.kernel.ontology.entity import Actor


# ═══════════════════════════════════════════════════════════════════════════════
# Password Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestPassword:
    """Password operations"""

    def test_set_password(self):
        login = LoginInfo(email="alice@example.com")
        result = login.set_password("SecurePass123!")
        assert result is True
        assert login.password.is_valid is True

    def test_verify_password(self):
        login = LoginInfo(email="alice@example.com")
        login.set_password("SecurePass123!")
        assert login.verify_password("SecurePass123!") is True
        assert login.verify_password("WrongPassword") is False

    def test_weak_password_rejected(self):
        login = LoginInfo(email="alice@example.com")
        result = login.set_password("weak")
        assert result is False

    def test_password_strength(self):
        login = LoginInfo(email="alice@example.com")
        login.set_password("VerySecureP@ssw0rd!")
        assert login.password.strength >= 80

    def test_password_expiry(self):
        login = LoginInfo(email="alice@example.com")
        login.set_password("SecurePass123!", expires_in_days=1)
        assert login.password.expires_at is not None
        assert login.password.is_expired is False

    def test_password_change(self):
        login = LoginInfo(email="alice@example.com")
        login.set_password("OldPassword123!")
        assert login.verify_password("OldPassword123!") is True

        login.set_password("NewPassword456!")
        assert login.verify_password("OldPassword123!") is False
        assert login.verify_password("NewPassword456!") is True


# ═══════════════════════════════════════════════════════════════════════════════
# OTP Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestOTP:
    """OTP operations"""

    def test_generate_otp(self):
        login = LoginInfo(email="alice@example.com", mobile="+15551234567")
        code = login.generate_otp()
        assert len(code) == 6
        assert login.otp.status == OTPStatus.PENDING

    def test_verify_otp_correct(self):
        login = LoginInfo(email="alice@example.com", mobile="+15551234567")
        code = login.generate_otp()
        assert login.verify_otp(code) is True
        assert login.otp.status == OTPStatus.VERIFIED

    def test_verify_otp_incorrect(self):
        login = LoginInfo(email="alice@example.com", mobile="+15551234567")
        login.generate_otp()
        assert login.verify_otp("000000") is False

    def test_otp_expiry(self):
        login = LoginInfo(email="alice@example.com")
        login.generate_otp(expiry_seconds=0)
        time.sleep(0.01)
        assert login.otp.is_expired is True

    def test_otp_max_attempts(self):
        login = LoginInfo(email="alice@example.com")
        login.generate_otp()
        for _ in range(3):
            login.verify_otp("000000")
        assert login.otp.status == OTPStatus.FAILED

    def test_otp_verifies_email(self):
        login = LoginInfo(email="alice@example.com")
        login.generate_otp()
        code = login.otp.code
        login.verify_otp(code)
        assert login.email_verified is True

    def test_otp_verifies_mobile(self):
        login = LoginInfo(mobile="+15551234567")
        login.generate_otp()
        code = login.otp.code
        login.verify_otp(code)
        assert login.mobile_verified is True


# ═══════════════════════════════════════════════════════════════════════════════
# Session Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestSession:
    """Session operations"""

    def test_create_session(self):
        login = LoginInfo(email="alice@example.com")
        session = login.create_session(
            ip_address="192.168.1.1",
            user_agent="Mozilla/5.0",
            device_type="laptop",
        )
        assert len(login.sessions) == 1
        assert session.is_active is True

    def test_multiple_sessions(self):
        login = LoginInfo(email="alice@example.com")
        login.create_session(device_type="laptop")
        login.create_session(device_type="mobile")
        assert len(login.sessions) == 2

    def test_active_sessions(self):
        login = LoginInfo(email="alice@example.com")
        login.create_session(device_type="laptop")
        login.create_session(device_type="mobile")
        assert len(login.active_sessions) == 2

    def test_invalidate_session(self):
        login = LoginInfo(email="alice@example.com")
        session = login.create_session()
        assert login.invalidate_session(session.session_id) is True
        assert session.is_active is False

    def test_invalidate_all_sessions(self):
        login = LoginInfo(email="alice@example.com")
        login.create_session()
        login.create_session()
        count = login.invalidate_all_sessions()
        assert count == 2
        assert len(login.active_sessions) == 0

    def test_session_expiry(self):
        login = LoginInfo(email="alice@example.com")
        session = login.create_session(expires_in_hours=0)
        time.sleep(0.01)
        assert session.is_expired is True
        assert len(login.active_sessions) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Account Lock Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAccountLock:
    """Account locking operations"""

    def test_failed_login(self):
        login = LoginInfo(email="alice@example.com")
        login.set_password("SecurePass123!")
        assert login.record_failed_login() is False
        assert login.login_attempts == 1

    def test_account_lock(self):
        login = LoginInfo(email="alice@example.com")
        login.set_password("SecurePass123!")
        for _ in range(5):
            login.record_failed_login()
        assert login.is_locked is True
        assert login.status == AccountStatus.LOCKED

    def test_lock_expiry(self):
        login = LoginInfo(email="alice@example.com")
        login.set_password("SecurePass123!")
        for _ in range(5):
            login.record_failed_login()
        login.locked_until = time.time() - 1  # Already expired
        assert login.is_locked is False
        assert login.status == AccountStatus.ACTIVE

    def test_reset_failed_logins(self):
        login = LoginInfo(email="alice@example.com")
        login.login_attempts = 3
        login.reset_failed_logins()
        assert login.login_attempts == 0
        assert login.locked_until is None


# ═══════════════════════════════════════════════════════════════════════════════
# Authentication Status Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAuthStatus:
    """Authentication status operations"""

    def test_unverified_account(self):
        login = LoginInfo(email="alice@example.com")
        assert login.status == AccountStatus.UNVERIFIED
        assert login.is_authenticated is False

    def test_verified_account(self):
        login = LoginInfo(email="alice@example.com")
        login.set_password("SecurePass123!")
        login.email_verified = True
        login.status = AccountStatus.ACTIVE
        assert login.is_authenticated is True

    def test_has_2fa(self):
        login = LoginInfo(email="alice@example.com", mobile="+15551234567")
        login.auth_methods.append(AuthMethod.OTP)
        login.mobile_verified = True
        assert login.has_2fa is True

    def test_no_2fa(self):
        login = LoginInfo(email="alice@example.com")
        assert login.has_2fa is False


# ═══════════════════════════════════════════════════════════════════════════════
# Serialization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestLoginInfoSerialization:
    """LoginInfo serialization roundtrip"""

    def test_to_dict(self):
        login = LoginInfo(email="alice@example.com", mobile="+15551234567")
        login.set_password("SecurePass123!")
        data = login.to_dict()
        assert data["email"] == "alice@example.com"
        assert data["mobile"] == "+15551234567"
        assert "password" in data

    def test_from_dict(self):
        data = {
            "email": "bob@example.com",
            "mobile": "+15559876543",
            "status": "active",
            "email_verified": True,
        }
        login = LoginInfo.from_dict(data)
        assert login.email == "bob@example.com"
        assert login.mobile == "+15559876543"
        assert login.email_verified is True

    def test_roundtrip(self):
        login = LoginInfo(email="alice@example.com", mobile="+15551234567")
        login.set_password("SecurePass123!")
        login.email_verified = True
        login.mobile_verified = True

        data = login.to_dict()
        login2 = LoginInfo.from_dict(data)
        assert login2.email == "alice@example.com"
        assert login2.email_verified is True
        assert login2.mobile_verified is True

    def test_session_serialization(self):
        login = LoginInfo(email="alice@example.com")
        login.create_session(device_type="laptop")
        data = login.to_dict()
        assert len(data["sessions"]) == 1

        login2 = LoginInfo.from_dict(data)
        assert len(login2.sessions) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Actor Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestActorIntegration:
    """Integration with Actor class"""

    def test_actor_has_login_info(self):
        a = Actor(entity_id="alice")
        assert hasattr(a, 'login_info')
        assert isinstance(a.login_info, LoginInfo)

    def test_actor_default_login_info(self):
        a = Actor(entity_id="alice")
        assert a.login_info.email == ""
        assert a.login_info.status == AccountStatus.UNVERIFIED

    def test_actor_set_email(self):
        a = Actor(entity_id="alice")
        a.login_info.email = "alice@example.com"
        assert a.login_info.email == "alice@example.com"

    def test_actor_set_mobile(self):
        a = Actor(entity_id="alice")
        a.login_info.mobile = "+15551234567"
        assert a.login_info.mobile == "+15551234567"

    def test_actor_set_password(self):
        a = Actor(entity_id="alice")
        a.login_info.set_password("SecurePass123!")
        assert a.login_info.password.is_valid is True

    def test_actor_verify_password(self):
        a = Actor(entity_id="alice")
        a.login_info.set_password("SecurePass123!")
        assert a.login_info.verify_password("SecurePass123!") is True

    def test_actor_generate_otp(self):
        a = Actor(entity_id="alice")
        a.login_info.mobile = "+15551234567"
        code = a.login_info.generate_otp()
        assert len(code) == 6

    def test_actor_create_session(self):
        a = Actor(entity_id="alice")
        session = a.login_info.create_session(device_type="laptop")
        assert len(a.login_info.sessions) == 1

    def test_actor_login_info_setter(self):
        a = Actor(entity_id="alice")
        new_login = LoginInfo(email="bob@example.com")
        a.login_info = new_login
        assert a.login_info.email == "bob@example.com"

    def test_actor_independence(self):
        a1 = Actor(entity_id="alice")
        a2 = Actor(entity_id="bob")
        a1.login_info.email = "alice@example.com"
        assert a2.login_info.email == ""


# ═══════════════════════════════════════════════════════════════════════════════
# Stress Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestLoginInfoStress:
    """Stress tests for login info"""

    def test_many_sessions(self):
        login = LoginInfo(email="alice@example.com")
        for i in range(100):
            login.create_session(device_type=f"device_{i}")
        assert len(login.sessions) == 100

    def test_password_performance(self):
        import time as t
        login = LoginInfo(email="alice@example.com")
        login.set_password("SecurePass123!")

        start = t.time()
        for _ in range(100):
            login.verify_password("SecurePass123!")
        elapsed = t.time() - start
        assert elapsed < 5.0

    def test_otp_generation_performance(self):
        import time as t
        login = LoginInfo(email="alice@example.com")

        start = t.time()
        for _ in range(100):
            login.generate_otp()
        elapsed = t.time() - start
        assert elapsed < 5.0
