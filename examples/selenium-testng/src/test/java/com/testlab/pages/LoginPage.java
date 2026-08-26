package com.testlab.pages;

import com.testlab.core.Credentials;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;

public final class LoginPage extends BasePage {
  private static final By PAGE = By.cssSelector("[data-testid='login-page']");
  private static final By EMAIL = By.cssSelector("[data-testid='login-email']");
  private static final By PASSWORD = By.cssSelector("[data-testid='login-password']");
  private static final By SUBMIT = By.cssSelector("[data-testid='login-submit']");

  public LoginPage(WebDriver driver) { super(driver); }

  public LoginPage openProtected(String path) {
    open(path);
    visible(PAGE);
    return this;
  }

  public void login(Credentials credentials) {
    visible(EMAIL).sendKeys(credentials.email());
    visible(PASSWORD).sendKeys(credentials.password());
    clickable(SUBMIT).click();
    wait.until(ExpectedConditions.not(ExpectedConditions.urlContains("/auth/login")));
    visible(By.cssSelector("[data-testid='user-menu']"));
  }
}
