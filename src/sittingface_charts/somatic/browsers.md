# browsers

## Capability: browsers
- **ID:** cap-browser-001
- **Platform:** Browser/Automation
- **Version:** 1.0.0
- **Status:** active
- **Description:** Browser automation for web scraping and testing
- **Module:** Cerebellum
- **Tags:** browser, automation, playwright

### Auth
- **Type:** none

### Endpoint
- **Base URL:** `http://localhost:8000/browsers`
- **Protocol:** http

### Operations
- **navigate** (READ): Navigate to a URL
- **screenshot** (READ): Take a screenshot
- **extract** (READ): Extract text from a page

### Test Scenarios
- happy_path
- timeout
- error
