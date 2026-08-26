package com.testlab.core;

import com.testlab.api.TestLabApi;
import com.testlab.driver.DriverManager;
import com.testlab.pages.LoginPage;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.Cookie;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.BeforeMethod;

public abstract class BaseUiTest {
  protected Credentials credentials;

  protected boolean provisionIsolatedUser() { return true; }

  @BeforeClass(alwaysRun = true)
  public void provisionAccount() {
    if (provisionIsolatedUser()) credentials = new TestLabApi().provisionUser(getClass());
  }

  @BeforeMethod(alwaysRun = true)
  public void startDriver() {
    DriverManager.start();
    driver().get(com.testlab.config.TestConfig.get().baseUrl().toString());
    driver().manage().addCookie(new Cookie.Builder("test_run", TestRunContext.get())
        .path("/").isHttpOnly(true).build());
  }

  @AfterMethod(alwaysRun = true)
  public void stopDriver() { DriverManager.stop(); }

  protected WebDriver driver() { return DriverManager.driver(); }

  protected void loginAndOpen(String path) {
    new LoginPage(driver()).openProtected(path).login(credentials);
  }
}
