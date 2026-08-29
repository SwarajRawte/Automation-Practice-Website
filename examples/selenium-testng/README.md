# Selenium + TestNG example

This is a standalone Java 17 Maven project for the E2E Test Lab. It uses Selenium WebDriver for browser coverage, TestNG for suites/groups/parallel classes, and REST Assured for API setup and assertions.

## Prerequisites

- JDK 17+
- Maven 3.9+
- Chrome, Firefox, or Edge for local runs; Selenium Manager resolves the matching driver
- The application running in local test mode

From the repository root, start the lab:

```powershell
npm install
npm run dev
```

The default URLs are `http://localhost:5173` for the browser and `http://localhost:3100` for direct API calls. The local `.env` must have `TEST_MODE=true` and a non-empty `TEST_CONTROL_KEY`. Never enable these controls in a public or production environment.

## Run

```powershell
cd examples/selenium-testng
mvn test
```

The listener creates one isolated in-memory test run for the suite and deletes it
at completion. REST Assured sends `x-test-run-id` on every application request;
each WebDriver receives the matching HttpOnly `test_run` cookie before login.
The suite provisions a distinct verified user for every stateful class and runs
up to four classes in parallel. Methods inside each class remain sequential.

Compile and run the framework checks without starting the application or a browser:

```powershell
mvn -DskipTests test
mvn "-DsuiteXmlFile=src/test/resources/testng-unit.xml" test
```

Run a visible local browser or another browser:

```powershell
mvn "-Dtest.headless=false" test
mvn "-Dtest.browser=firefox" test
mvn "-Dtest.browser=edge" test
```

Run against Selenium Grid:

```powershell
mvn "-Dtest.remoteUrl=http://localhost:4444" "-Dtest.browser=chrome" test
```

The download assertion is skipped for remote sessions because the downloaded file belongs to the Grid node. Uploads and all other scenarios still run remotely.

## Configuration

Java system properties take precedence over environment variables.

| System property | Environment variable | Default |
| --- | --- | --- |
| `test.baseUrl` | `BASE_URL` | `http://localhost:5173` |
| `test.apiUrl` | `API_URL` | `http://localhost:3100` |
| `test.browser` | `BROWSER` | `chrome` |
| `test.remoteUrl` | `SELENIUM_REMOTE_URL` | empty (local driver) |
| `test.headless` | `HEADLESS` | `true` |
| `test.timeoutSeconds` | `TIMEOUT_SECONDS` | `12` |
| `test.testControlKey` | `TEST_CONTROL_KEY` | `testlab-control` |
| `test.testRunKey` | `TEST_RUN_KEY` | value of `TEST_CONTROL_KEY` |
| `test.downloadDir` | `DOWNLOAD_DIR` | `target/downloads` |

Only `chrome`, `firefox`, and `edge` are accepted. Invalid booleans, timeouts, URLs, and browser names fail early with an actionable message.

## Structure and coverage

- `config` centralizes validated properties and environment variables.
- `driver` owns one WebDriver and download directory per thread.
- `api` creates/deletes the suite run, binds requests to its run header, logs in with cookies and bearer tokens, and provisions isolated users.
- `pages` contains page objects plus the reusable application-shell component.
- `listeners` performs suite setup and writes failure screenshots to `target/screenshots`.
- `tests` covers login return URLs, RBAC, form validation, explicit waits, Selenium Actions, alerts, windows, nested frames, open/nested shadow roots, uploads, downloads, and an authenticated API form flow.

Run only a TestNG group by overriding the suite or editing a copy of `testng.xml`. Live scenarios carry the `live` group; the no-app contract checks carry `unit`.

Dependency versions were selected from the primary project release pages: [Selenium downloads](https://www.selenium.dev/downloads/), [TestNG releases](https://github.com/testng-team/testng/releases), [REST Assured](https://rest-assured.io/), and [Apache Maven plugins](https://maven.apache.org/plugins/).
