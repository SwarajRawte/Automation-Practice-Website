package com.testlab.tests;

import static org.testng.Assert.assertTrue;

import com.testlab.core.BaseUiTest;
import com.testlab.pages.LabPage;
import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.Test;

@Test(groups = "live")
public final class FormsAndWaitsTest extends BaseUiTest {
  public void reportsCrossFieldValidationErrors() {
    loginAndOpen("/forms/validation");
    LabPage page = new LabPage(driver());
    page.named("password").sendKeys("Password1!");
    page.named("confirmPassword").sendKeys("Different1!");
    new Select(page.named("employment")).selectByVisibleText("Employed");
    setDate(page.named("startDate"), "2026-01-20");
    setDate(page.named("endDate"), "2026-01-10");
    page.testId("form-submit").click();
    String errors = page.alertRegion().getText();
    assertTrue(errors.contains("Passwords must match"));
    assertTrue(errors.contains("Company is required"));
    assertTrue(errors.contains("Start date must be before end date"));
  }

  public void explicitWaitsObserveTheWholeStateTransition() {
    loginAndOpen("/dynamic-elements?delay=300");
    WebDriverWait wait = new WebDriverWait(driver(), Duration.ofSeconds(5));
    wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector("[data-testid='appeared-element']")));
    wait.until(ExpectedConditions.invisibilityOfElementLocated(By.cssSelector("[data-testid='disappearing-element']")));
    wait.until(ExpectedConditions.elementToBeClickable(By.xpath("//button[normalize-space()='Delayed enabled button']")));
    wait.until(ExpectedConditions.textToBePresentInElementLocated(By.cssSelector("[data-testid='poll-status']"), "COMPLETE"));
  }

  private void setDate(WebElement input, String value) {
    ((JavascriptExecutor) driver()).executeScript(
        "const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;"
            + "setter.call(arguments[0],arguments[1]);"
            + "arguments[0].dispatchEvent(new Event('input',{bubbles:true}));"
            + "arguments[0].dispatchEvent(new Event('change',{bubbles:true}));",
        input, value);
  }
}
