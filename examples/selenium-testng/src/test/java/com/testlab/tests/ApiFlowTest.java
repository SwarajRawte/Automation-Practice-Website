package com.testlab.tests;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.testlab.api.TestLabApi;
import com.testlab.core.Credentials;
import java.util.Map;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

@Test(groups = "live")
public final class ApiFlowTest {
  private final TestLabApi api = new TestLabApi();
  private Credentials credentials;

  @BeforeClass(alwaysRun = true)
  public void provision() { credentials = api.provisionUser(getClass()); }

  public void cookieBackedSessionCreatesAndReadsOwnedFormData() {
    TestLabApi.Session session = api.login(credentials);
    session.request().get("/api/auth/session").then().statusCode(200)
        .body("user.email", equalTo(credentials.email()));
    int id = session.request().body(Map.of(
            "name", "API Tester", "email", credentials.email(),
            "password", "Secret123!", "confirmPassword", "Secret123!"))
        .post("/api/forms").then().statusCode(201).body("data.password", nullValue())
        .extract().path("id");
    session.request().get("/api/forms/{id}", id).then().statusCode(200)
        .body("id", equalTo(id)).body("data.email", equalTo(credentials.email()));
  }
}
