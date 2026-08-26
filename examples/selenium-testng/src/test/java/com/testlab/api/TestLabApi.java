package com.testlab.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;

import com.testlab.config.TestConfig;
import com.testlab.core.Credentials;
import com.testlab.core.TestRunContext;
import io.restassured.filter.cookie.CookieFilter;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.Map;

public final class TestLabApi {
  private final TestConfig config = TestConfig.get();

  public record Session(CookieFilter cookies, String accessToken, String testRunId) {
    public RequestSpecification request() {
      return given().baseUri(TestConfig.get().apiUrl().toString()).filter(cookies)
          .header("x-test-run-id", testRunId).auth().oauth2(accessToken)
          .contentType(ContentType.JSON);
    }
  }

  private RequestSpecification isolatedRequest() {
    return given().baseUri(config.apiUrl().toString())
        .header("x-test-run-id", TestRunContext.get());
  }

  public String createRun(String label) {
    given().baseUri(config.apiUrl().toString()).get("/api/health")
        .then().statusCode(200).body("status", equalTo("UP")).body("testMode", equalTo(true));
    return given().baseUri(config.apiUrl().toString()).header("x-test-key", config.testRunKey())
        .contentType(ContentType.JSON).body(Map.of("label", label)).post("/api/test/runs")
        .then().statusCode(201).extract().path("run.id");
  }

  public void deleteRun(String runId) {
    given().baseUri(config.apiUrl().toString()).header("x-test-key", config.testRunKey())
        .delete("/api/test/runs/{id}", runId).then().statusCode(anyOf(is(204), is(404)));
  }

  public void resetDatabase() {
    Session admin = login(Credentials.ADMIN);
    admin.request().header("x-test-key", config.testControlKey())
        .post("/api/test/reset").then().statusCode(200);
  }

  public Credentials provisionUser(Class<?> owner) {
    String slug = owner.getSimpleName().replaceAll("[^A-Za-z0-9]", "").toLowerCase();
    Credentials credentials = new Credentials("selenium." + slug + "@testlab.local", "Selenium123!");
    Response registration = isolatedRequest().contentType(ContentType.JSON)
        .body(Map.of("name", "Selenium " + owner.getSimpleName(), "email", credentials.email(),
            "password", credentials.password()))
        .post("/api/auth/register").then().statusCode(201).extract().response();
    String token = registration.path("verificationToken");
    isolatedRequest().contentType(ContentType.JSON)
        .body(Map.of("token", token)).post("/api/auth/verify").then().statusCode(200);
    return credentials;
  }

  public Session login(Credentials credentials) {
    CookieFilter cookies = new CookieFilter();
    Response response = isolatedRequest().filter(cookies).contentType(ContentType.JSON)
        .body(Map.of("email", credentials.email(), "password", credentials.password(), "rememberMe", false))
        .post("/api/auth/login").then().statusCode(200).extract().response();
    return new Session(cookies, response.path("token"), TestRunContext.get());
  }
}
