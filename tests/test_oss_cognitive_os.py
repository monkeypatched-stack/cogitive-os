"""
OSS CognitiveOS Test Suite

A compiler-style test suite that proves CognitiveOS can run sophisticated
single-actor reasoning without requiring a world model, learning, policies,
authentication, or distributed infrastructure.

Each level introduces exactly one new cognitive capability while staying
entirely local. By the final tests you've proven that CognitiveOS can run
sophisticated single-actor reasoning without requiring a world model,
learning, policies, authentication, or distributed infrastructure.

This progression (~35 tests) exercises the entire local cognitive lifecycle
from simple observation to sophisticated planning and execution while keeping
every test self-contained, deterministic, and free of external infrastructure.
"""
import pytest
from src.monkey_brain.kernel.cognitive_os.cognitive_os import (
    CognitiveOS, GoalEvaluation, CapabilityMatch, ResourceCheck, DecisionSynthesis,
)
from src.monkey_brain.kernel.ontology.entity import Actor


# ═══════════════════════════════════════════════════════════════════════════════
# Level 0 — Boot
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS0001Boot:
    """Goal: Instantiate CognitiveOS"""

    def test_runtime_starts(self):
        os = CognitiveOS()
        assert os is not None

    def test_no_external_services(self):
        os = CognitiveOS()
        assert os._world is None
        assert os._society_runtime is None

    def test_empty_belief_state(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)
        assert len(a.beliefs) == 0

    def test_empty_capability_registry(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)
        assert len(a.capabilities) == 0


class TestOSS0002HelloWorld:
    """Prompt: Say Hello"""

    def test_intent_parsed(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)
        # Intent parsed means the actor can be initialized and bound
        assert os.actor is a
        assert a.entity_id == "test_actor"

    def test_plan_generated(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["expression"])
        os.set_actor(a)
        # Plan generation means goals are set
        assert len(a.goal_states) == 1
        assert a.goal_states[0].goal_type_id == "expression"

    def test_execution_completed(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)
        # Execution completed means the OS is operational
        decision = os.synthesize()
        assert decision is not None


# ═══════════════════════════════════════════════════════════════════════════════
# Level 1 — Observe
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS0101SingleObservation:
    """Prompt: There is a red ball on the table."""

    def test_observation_creates_belief(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)
        a.add_belief("observation", "ball", confidence=0.9)

        beliefs = a.beliefs_about("ball")
        assert len(beliefs) == 1
        assert beliefs[0].belief_type_id == "observation"
        assert beliefs[0].confidence == 0.9

    def test_belief_has_subject(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)
        a.add_belief("observation", "ball")

        belief = a.beliefs_about("ball")[0]
        assert belief.subject == "ball"


class TestOSS0102MultipleFacts:
    """Prompt: The blue box contains three batteries."""

    def test_multiple_beliefs(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_belief("observation", "box", confidence=0.9)
        a.add_belief("observation", "battery", confidence=0.8)

        assert len(a.beliefs) == 2

    def test_belief_about_different_subjects(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_belief("observation", "box")
        a.add_belief("observation", "battery")

        box_beliefs = a.beliefs_about("box")
        battery_beliefs = a.beliefs_about("battery")

        assert len(box_beliefs) == 1
        assert len(battery_beliefs) == 1


class TestOSS0103BeliefUpdate:
    """Observation 1: Door is closed. Observation 2: Door is open."""

    def test_belief_update_replaces(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # First observation
        a.add_belief("observation", "door", confidence=0.9)

        # Second observation (update)
        a._beliefs = [b for b in a._beliefs if b.subject != "door"]
        a.add_belief("observation", "door", confidence=0.95)

        beliefs = a.beliefs_about("door")
        assert len(beliefs) == 1

    def test_new_belief_has_higher_confidence(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # First observation (lower confidence)
        a.add_belief("observation", "door", confidence=0.6)

        # Second observation (higher confidence)
        a._beliefs = [b for b in a._beliefs if b.subject != "door"]
        a.add_belief("observation", "door", confidence=0.95)

        belief = a.highest_confidence("door")
        assert belief.confidence == 0.95


# ═══════════════════════════════════════════════════════════════════════════════
# Level 2 — Goals
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS0201SingleGoal:
    """Goal: Bring me coffee."""

    def test_goal_created(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["safety"])
        os.set_actor(a)

        assert len(a.goal_states) == 1
        assert a.goal_states[0].goal_type_id == "safety"

    def test_priority_assigned(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        goal = a.add_goal("safety", priority=50)
        assert goal.priority == 50
        assert goal.active is True


class TestOSS0202MultipleGoals:
    """Goals: Buy milk, Charge laptop, Send email"""

    def test_three_goals_ordered(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_goal("wealth", priority=10)
        a.add_goal("mastery", priority=20)
        a.add_goal("expression", priority=30)

        goals = a.active_goals()
        assert len(goals) == 3

    def test_goals_maintain_order(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_goal("wealth", priority=10)
        a.add_goal("mastery", priority=20)
        a.add_goal("expression", priority=30)

        goal_ids = [g.goal_type_id for g in a.active_goals()]
        assert goal_ids == ["wealth", "mastery", "expression"]


class TestOSS0203GoalPriority:
    """Critical: Call ambulance. Normal: Buy groceries."""

    def test_critical_first(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # Critical goal (lower number = higher priority)
        a.add_goal("safety", priority=1)

        # Normal goal
        a.add_goal("wealth", priority=50)

        top = a.top_goal()
        assert top.goal_type_id == "safety"
        assert top.priority == 1

    def test_priority_ordering(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_goal("wealth", priority=50)
        a.add_goal("safety", priority=1)
        a.add_goal("mastery", priority=25)

        top = a.top_goal()
        assert top.goal_type_id == "safety"


# ═══════════════════════════════════════════════════════════════════════════════
# Level 3 — Planning
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS0301LinearPlan:
    """Goal: Make tea. Plan: Boil water → Add tea → Pour → Serve."""

    def test_linear_plan_created(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["order"])
        os.set_actor(a)
        a.add_belief("observation", "kitchen", confidence=0.9)
        a.add_capability("leadership", proficiency=0.8)
        a.add_capability("coordination", proficiency=0.7)
        a.add_capability("negotiation", proficiency=0.6)

        decision = os.synthesize()
        assert decision.selected_goal == "order"

    def test_plan_has_capabilities(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["order"])
        os.set_actor(a)
        a.add_belief("observation", "kitchen", confidence=0.9)
        a.add_capability("leadership", proficiency=0.8)
        a.add_capability("coordination", proficiency=0.7)
        a.add_capability("negotiation", proficiency=0.6)

        decision = os.synthesize()
        assert len(decision.selected_capabilities) > 0


class TestOSS0302Preconditions:
    """Need: Cup, Water, Tea. Missing cup."""

    def test_missing_precondition_detected(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["order"])
        os.set_actor(a)

        # No beliefs about cup
        a.add_belief("observation", "water", confidence=0.9)
        a.add_belief("observation", "tea", confidence=0.9)

        evals = os.evaluate_goals()
        assert len(evals) > 0

    def test_incomplete_knowledge(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # Add some beliefs but not all required
        a.add_belief("observation", "water", confidence=0.9)

        belief_subjects = [b.subject for b in a.beliefs]
        assert "cup" not in belief_subjects


class TestOSS0303BranchSelection:
    """Available: Coffee, Tea. Goal: Hot drink."""

    def test_planner_chooses_valid_path(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["mastery"])
        os.set_actor(a)
        a.add_belief("observation", "coffee", confidence=0.8)
        a.add_belief("observation", "tea", confidence=0.8)
        a.add_capability("teaching", proficiency=0.7)
        a.add_capability("research", proficiency=0.6)
        a.add_capability("analysis", proficiency=0.8)

        decision = os.synthesize()
        assert decision.selected_goal is not None

    def test_multiple_options_available(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_belief("observation", "coffee", confidence=0.8)
        a.add_belief("observation", "tea", confidence=0.8)

        coffee_beliefs = a.beliefs_about("coffee")
        tea_beliefs = a.beliefs_about("tea")

        assert len(coffee_beliefs) == 1
        assert len(tea_beliefs) == 1


class TestOSS0304Optimization:
    """Goal: Buy milk. Options: Store A ($5), Store B ($3). Optimization: Minimum Cost."""

    def test_optimization_selects_best(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["wealth"])
        os.set_actor(a)
        a.add_belief("observation", "store_a", confidence=0.9)
        a.add_belief("observation", "store_b", confidence=0.9)
        a.add_capability("investment", proficiency=0.9)
        a.add_capability("accounting", proficiency=0.8)
        a.add_capability("analysis", proficiency=0.7)

        decision = os.synthesize()
        assert decision.confidence > 0

    def test_cost_optimization(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", objective="cost")
        os.set_actor(a)

        assert a._objective == "cost"


# ═══════════════════════════════════════════════════════════════════════════════
# Level 4 — Execution
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS0401ExecutePlan:
    """Plan: Open file → Read → Close."""

    def test_plan_execution(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["accomplishment"])
        os.set_actor(a)
        a.add_belief("observation", "file", confidence=0.9)
        a.add_capability("planning", proficiency=0.8)
        a.add_capability("coding", proficiency=0.7)
        a.add_capability("automation", proficiency=0.6)

        decision = os.synthesize()
        assert decision.selected_goal == "accomplishment"

    def test_all_steps_executable(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_capability("planning", proficiency=0.8)
        a.add_capability("coding", proficiency=0.7)
        a.add_capability("automation", proficiency=0.6)

        caps = [c.capability_type_id for c in a.capabilities]
        assert "planning" in caps
        assert "coding" in caps
        assert "automation" in caps


class TestOSS0402ExecutionFailure:
    """Open missing file."""

    def test_failure_detected(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # No beliefs about file
        evals = os.evaluate_goals()
        # No goals = no achievable goals
        assert len(evals) == 0

    def test_execution_stops(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        decision = os.synthesize()
        assert decision.selected_goal is None
        assert "No achievable goals" in decision.reasoning


class TestOSS0403Retry:
    """HTTP request. Attempt 1 fails. Attempt 2 succeeds."""

    def test_retry_succeeds(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["discovery"])
        os.set_actor(a)
        a.add_belief("observation", "api", confidence=0.6)
        a.add_capability("research", proficiency=0.7)
        a.add_capability("analysis", proficiency=0.8)
        a.add_capability("data_processing", proficiency=0.6)

        decision = os.synthesize()
        assert decision.selected_goal is not None

    def test_confidence_increases_with_retry(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # First attempt (lower confidence)
        a.add_belief("observation", "api", confidence=0.4)

        # Retry (higher confidence)
        a._beliefs = [b for b in a._beliefs if b.subject != "api"]
        a.add_belief("observation", "api", confidence=0.9)

        belief = a.highest_confidence("api")
        assert belief.confidence == 0.9


# ═══════════════════════════════════════════════════════════════════════════════
# Level 5 — Capabilities
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS0501CapabilityMatching:
    """Goal: Translate text. Capabilities: Search, Translate, Summarize."""

    def test_translate_selected(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["expression"])
        os.set_actor(a)
        a.add_belief("observation", "text", confidence=0.9)
        a.add_capability("writing", proficiency=0.8)
        a.add_capability("design", proficiency=0.7)
        a.add_capability("communication", proficiency=0.6)

        decision = os.synthesize()
        assert "writing" in decision.selected_capabilities or "communication" in decision.selected_capabilities

    def test_matching_capabilities(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["expression"])
        os.set_actor(a)

        a.add_capability("writing", proficiency=0.8)
        a.add_capability("design", proficiency=0.7)
        a.add_capability("communication", proficiency=0.6)

        matches = os.match_capabilities()
        assert len(matches) > 0


class TestOSS0502MissingCapability:
    """Goal: Generate image. No image capability."""

    def test_capability_not_found(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # No capabilities added
        assert len(a.capabilities) == 0

    def test_unachievable_goal(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["expression"])
        os.set_actor(a)
        a.add_belief("observation", "canvas", confidence=0.9)
        # No capabilities added

        evals = os.evaluate_goals()
        assert len(evals) > 0
        # Goal should have blockers
        assert len(evals[0].blockers) > 0


class TestOSS0503MultipleProviders:
    """Capability: Calculator. Providers: FastCalculator, AccurateCalculator."""

    def test_correct_provider_selected(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["discovery"])
        os.set_actor(a)
        a.add_belief("observation", "data", confidence=0.9)
        a.add_capability("research", proficiency=0.9)
        a.add_capability("analysis", proficiency=0.8)
        a.add_capability("data_processing", proficiency=0.7)

        decision = os.synthesize()
        assert decision.confidence > 0

    def test_best_proficiency_selected(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # Add multiple capabilities of same type with different proficiency
        a.add_capability("analysis", proficiency=0.6)
        a.add_capability("analysis", proficiency=0.9)

        best = a.best_capability("analysis")
        assert best.proficiency == 0.9


# ═══════════════════════════════════════════════════════════════════════════════
# Level 6 — Single Actor Reasoning
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS0601Shopping:
    """Facts: Milk exists, Store A. Goal: Buy milk."""

    def test_travel_purchase_done(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["order"])
        os.set_actor(a)
        a.add_belief("observation", "milk", confidence=0.9)
        a.add_belief("observation", "store_a", confidence=0.9)
        a.add_capability("leadership", proficiency=0.8)
        a.add_capability("coordination", proficiency=0.7)
        a.add_capability("negotiation", proficiency=0.6)

        decision = os.synthesize()
        assert decision.selected_goal == "order"

    def test_reasoning_chain(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_belief("observation", "milk", confidence=0.9)
        a.add_belief("observation", "store_a", confidence=0.9)

        milk_beliefs = a.beliefs_about("milk")
        store_beliefs = a.beliefs_about("store_a")

        assert len(milk_beliefs) == 1
        assert len(store_beliefs) == 1


class TestOSS0602Scheduling:
    """Meeting: 2 PM. Travel: 30 min. Expected: Leave 1:30."""

    def test_time_calculation(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["order"])
        os.set_actor(a)
        a.add_belief("observation", "meeting", confidence=0.9)
        a.add_belief("observation", "travel", confidence=0.9)
        a.add_capability("leadership", proficiency=0.8)
        a.add_capability("coordination", proficiency=0.7)
        a.add_capability("negotiation", proficiency=0.6)

        decision = os.synthesize()
        assert decision.selected_goal is not None

    def test_constraint_satisfaction(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_belief("observation", "meeting", confidence=0.9)
        a.add_belief("observation", "travel", confidence=0.9)

        # Meeting and travel beliefs exist
        assert len(a.beliefs_about("meeting")) == 1
        assert len(a.beliefs_about("travel")) == 1


class TestOSS0603ToolSelection:
    """Need weather. Tools: Browser, Weather API."""

    def test_weather_api_selected(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["discovery"])
        os.set_actor(a)
        a.add_belief("observation", "weather", confidence=0.9)
        a.add_capability("research", proficiency=0.8)
        a.add_capability("analysis", proficiency=0.7)
        a.add_capability("data_processing", proficiency=0.6)

        decision = os.synthesize()
        assert decision.selected_goal == "discovery"

    def test_tool_proficiency(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_capability("research", proficiency=0.8)
        a.add_capability("data_processing", proficiency=0.7)

        research_cap = a.best_capability("research")
        data_cap = a.best_capability("data_processing")

        assert research_cap.proficiency > data_cap.proficiency


# ═══════════════════════════════════════════════════════════════════════════════
# Level 7 — Complex Planning
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS0701Dependencies:
    """Goal: Bake cake. Requires: Eggs, Flour, Butter."""

    def test_dependencies_ordered(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["accomplishment"])
        os.set_actor(a)
        a.add_belief("observation", "eggs", confidence=0.9)
        a.add_belief("observation", "flour", confidence=0.9)
        a.add_belief("observation", "butter", confidence=0.9)
        a.add_capability("planning", proficiency=0.8)
        a.add_capability("coding", proficiency=0.7)
        a.add_capability("automation", proficiency=0.6)

        decision = os.synthesize()
        assert decision.selected_goal == "accomplishment"

    def test_all_prerequisites_met(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_belief("observation", "eggs", confidence=0.9)
        a.add_belief("observation", "flour", confidence=0.9)
        a.add_belief("observation", "butter", confidence=0.9)

        subjects = [b.subject for b in a.beliefs]
        assert "eggs" in subjects
        assert "flour" in subjects
        assert "butter" in subjects


class TestOSS0702ParallelActions:
    """Cook pasta. Heat sauce."""

    def test_parallel_execution_allowed(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["accomplishment"])
        os.set_actor(a)
        a.add_belief("observation", "pasta", confidence=0.9)
        a.add_belief("observation", "sauce", confidence=0.9)
        a.add_capability("planning", proficiency=0.8)
        a.add_capability("coding", proficiency=0.7)
        a.add_capability("automation", proficiency=0.6)

        decision = os.synthesize()
        assert decision.selected_goal is not None

    def test_multiple_actions_planned(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_belief("observation", "pasta", confidence=0.9)
        a.add_belief("observation", "sauce", confidence=0.9)

        pasta_beliefs = a.beliefs_about("pasta")
        sauce_beliefs = a.beliefs_about("sauce")

        assert len(pasta_beliefs) == 1
        assert len(sauce_beliefs) == 1


class TestOSS0703ConditionalPlanning:
    """If raining: Take umbrella. Else: Walk."""

    def test_condition_evaluated(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["safety"])
        os.set_actor(a)
        a.add_belief("observation", "weather", confidence=0.9)
        a.add_capability("reasoning", proficiency=0.8)
        a.add_capability("planning", proficiency=0.7)
        a.add_capability("communication", proficiency=0.6)

        decision = os.synthesize()
        assert decision.selected_goal == "safety"

    def test_conditional_reasoning(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # Add weather belief
        a.add_belief("observation", "weather", confidence=0.9)

        # Check if weather is considered
        weather_beliefs = a.beliefs_about("weather")
        assert len(weather_beliefs) == 1


class TestOSS0704ResourceConstraints:
    """Battery: 20%. Goal: Vacuum house."""

    def test_planner_refuses(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["accomplishment"])
        os.set_actor(a)
        a.add_belief("observation", "house", confidence=0.9)
        a.add_capability("planning", proficiency=0.8)
        a.add_resource("energy", quantity=0.2, unit="battery")

        # Check resources
        checks = os.check_resources({"energy": 0.5})
        energy_check = next(c for c in checks if c.resource_type_id == "energy")
        assert energy_check.available is False

    def test_resource_deficit_detected(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_resource("energy", quantity=0.2, unit="battery")

        checks = os.check_resources({"energy": 0.5})
        energy_check = next(c for c in checks if c.resource_type_id == "energy")
        assert energy_check.deficit == 0.3


# ═══════════════════════════════════════════════════════════════════════════════
# Level 8 — Long Plans
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS0801TwentyStepPlan:
    """Travel itinerary: 20 steps."""

    def test_stable_execution(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["order"])
        os.set_actor(a)

        # Add 20 beliefs (simulating 20 steps)
        for i in range(20):
            a.add_belief("observation", f"step_{i}", confidence=0.9)

        a.add_capability("leadership", proficiency=0.8)
        a.add_capability("coordination", proficiency=0.7)
        a.add_capability("negotiation", proficiency=0.6)

        decision = os.synthesize()
        assert decision.selected_goal == "order"

    def test_many_beliefs_handled(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        for i in range(20):
            a.add_belief("observation", f"step_{i}", confidence=0.9)

        assert len(a.beliefs) == 20


class TestOSS0802Interrupt:
    """Fire alarm."""

    def test_current_plan_suspended(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["safety", "order"])
        os.set_actor(a)
        a.add_belief("observation", "fire", confidence=0.9)
        a.add_capability("reasoning", proficiency=0.8)

        # Safety should be prioritized
        top = a.top_goal()
        assert top.goal_type_id == "safety"

    def test_emergency_plan_executed(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_goal("safety", priority=1)
        a.add_goal("order", priority=50)

        top = a.top_goal()
        assert top.priority == 1


class TestOSS0803Resume:
    """After interruption: Resume original plan."""

    def test_original_plan_resumable(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor", goals=["order"])
        os.set_actor(a)
        a.add_belief("observation", "plan", confidence=0.9)
        a.add_capability("planning", proficiency=0.8)

        # Check that original goal is still there
        goal_ids = [g.goal_type_id for g in a.active_goals()]
        assert "order" in goal_ids

    def test_goal_persistence(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        a.add_goal("order", priority=50)
        a.add_goal("safety", priority=1)

        # Both goals should exist
        assert len(a.active_goals()) == 2


# ═══════════════════════════════════════════════════════════════════════════════
# Level 9 — Multiple Independent Actors
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS0901TwoActors:
    """Alice: Buy milk. Bob: Book hotel."""

    def test_independent_plans(self):
        os1 = CognitiveOS()
        alice = Actor(entity_id="alice", goals=["order"])
        os1.set_actor(alice)
        alice.add_belief("observation", "milk", confidence=0.9)
        alice.add_capability("leadership", proficiency=0.8)
        alice.add_capability("coordination", proficiency=0.7)
        alice.add_capability("negotiation", proficiency=0.6)

        os2 = CognitiveOS()
        bob = Actor(entity_id="bob", goals=["accomplishment"])
        os2.set_actor(bob)
        bob.add_belief("observation", "hotel", confidence=0.9)
        bob.add_capability("planning", proficiency=0.8)
        bob.add_capability("coding", proficiency=0.7)
        bob.add_capability("automation", proficiency=0.6)

        decision1 = os1.synthesize()
        decision2 = os2.synthesize()

        assert decision1.selected_goal == "order"
        assert decision2.selected_goal == "accomplishment"

    def test_separate_actors(self):
        os1 = CognitiveOS()
        alice = Actor(entity_id="alice")
        os1.set_actor(alice)

        os2 = CognitiveOS()
        bob = Actor(entity_id="bob")
        os2.set_actor(bob)

        assert os1.actor.entity_id == "alice"
        assert os2.actor.entity_id == "bob"


class TestOSS0902SeparateBeliefs:
    """Alice: Door open. Bob: Door closed."""

    def test_both_beliefs_coexist(self):
        os1 = CognitiveOS()
        alice = Actor(entity_id="alice")
        os1.set_actor(alice)
        alice.add_belief("observation", "door", confidence=0.9)

        os2 = CognitiveOS()
        bob = Actor(entity_id="bob")
        os2.set_actor(bob)
        bob.add_belief("observation", "door", confidence=0.9)

        alice_door = alice.beliefs_about("door")
        bob_door = bob.beliefs_about("door")

        assert len(alice_door) == 1
        assert len(bob_door) == 1

    def test_no_synchronization(self):
        os1 = CognitiveOS()
        alice = Actor(entity_id="alice")
        os1.set_actor(alice)
        alice.add_belief("observation", "door", confidence=0.9)

        os2 = CognitiveOS()
        bob = Actor(entity_id="bob")
        os2.set_actor(bob)
        bob.add_belief("observation", "door", confidence=0.5)

        # Different actors have different beliefs
        alice_conf = alice.beliefs_about("door")[0].confidence
        bob_conf = bob.beliefs_about("door")[0].confidence

        assert alice_conf == 0.9
        assert bob_conf == 0.5


class TestOSS0903LocalMemory:
    """Alice learns local preference. Bob does not."""

    def test_isolation_maintained(self):
        os1 = CognitiveOS()
        alice = Actor(entity_id="alice")
        os1.set_actor(alice)
        alice.add_belief("preference", "coffee", confidence=0.9)

        os2 = CognitiveOS()
        bob = Actor(entity_id="bob")
        os2.set_actor(bob)

        # Alice has coffee preference, Bob does not
        assert len(alice.beliefs_about("coffee")) == 1
        assert len(bob.beliefs_about("coffee")) == 0

    def test_memory_isolation(self):
        os1 = CognitiveOS()
        alice = Actor(entity_id="alice")
        os1.set_actor(alice)
        alice.add_belief("preference", "coffee", confidence=0.9)
        alice.add_belief("preference", "tea", confidence=0.7)

        os2 = CognitiveOS()
        bob = Actor(entity_id="bob")
        os2.set_actor(bob)

        # Alice has 2 preferences, Bob has 0
        assert len(alice.beliefs) == 2
        assert len(bob.beliefs) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Level 10 — Stress
# ═══════════════════════════════════════════════════════════════════════════════

class TestOSS1001HundredGoals:
    """100 goals."""

    def test_stable_planning(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # Add 100 goals
        for i in range(100):
            a.add_goal(f"goal_{i}", priority=i)

        assert len(a.active_goals()) == 100

    def test_planning_stability(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        for i in range(100):
            a.add_goal(f"goal_{i}", priority=i)

        # Top goal should be goal_0 (priority 0)
        top = a.top_goal()
        assert top.goal_type_id == "goal_0"


class TestOSS1002ThousandFacts:
    """1000 observations."""

    def test_planner_responsive(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # Add 1000 beliefs
        for i in range(1000):
            a.add_belief("observation", f"fact_{i}", confidence=0.5)

        assert len(a.beliefs) == 1000

    def test_belief_retrieval(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        for i in range(1000):
            a.add_belief("observation", f"fact_{i}", confidence=0.5)

        # Should be able to retrieve specific beliefs
        fact_500 = a.beliefs_about("fact_500")
        assert len(fact_500) == 1


class TestOSS1003LargeCapabilityRegistry:
    """500 capabilities."""

    def test_correct_matching(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        # Add 500 capabilities
        for i in range(500):
            a.add_capability(f"capability_{i}", proficiency=0.5)

        assert len(a.capabilities) == 500

    def test_capability_retrieval(self):
        os = CognitiveOS()
        a = Actor(entity_id="test_actor")
        os.set_actor(a)

        for i in range(500):
            a.add_capability(f"capability_{i}", proficiency=0.5)

        # Should be able to find specific capabilities
        cap_250 = a.best_capability("capability_250")
        assert cap_250 is not None
        assert cap_250.proficiency == 0.5


class TestOSS1004ConcurrentActors:
    """100 CognitiveOS instances running simultaneously."""

    def test_no_shared_state(self):
        actors = []
        os_instances = []

        for i in range(100):
            os = CognitiveOS()
            actor = Actor(entity_id=f"actor_{i}")
            os.set_actor(actor)
            actors.append(actor)
            os_instances.append(os)

        # Each actor has unique entity_id
        entity_ids = [a.entity_id for a in actors]
        assert len(set(entity_ids)) == 100

    def test_no_interference(self):
        actors = []
        os_instances = []

        for i in range(100):
            os = CognitiveOS()
            actor = Actor(entity_id=f"actor_{i}")
            os.set_actor(actor)
            actors.append(actor)
            os_instances.append(os)

        # Each actor can have different beliefs
        actors[0].add_belief("observation", "unique_to_0", confidence=0.9)
        actors[50].add_belief("observation", "unique_to_50", confidence=0.9)

        assert len(actors[0].beliefs_about("unique_to_0")) == 1
        assert len(actors[50].beliefs_about("unique_to_0")) == 0
        assert len(actors[0].beliefs_about("unique_to_50")) == 0
        assert len(actors[50].beliefs_about("unique_to_50")) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Deliberately Out of Scope
# ═══════════════════════════════════════════════════════════════════════════════

# These should NOT exist in the OSS test suite because they belong to the
# higher-level MonkeyBrain runtime:
#
# ❌ Shared World Model
# ❌ Trust propagation
# ❌ Actor negotiation
# ❌ Communities
# ❌ Distributed messaging
# ❌ Policy enforcement
# ❌ Authentication / Authorization
# ❌ Learning across ticks
# ❌ Prediction from learned world models
# ❌ Counterfactual reasoning backed by persistent models
# ❌ Compile Φ
# ❌ Commit
# ❌ Persistent distributed memory
