package com.testlab.tests;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import com.testlab.config.TestConfig;
import com.testlab.core.BaseUiTest;
import com.testlab.pages.LabPage;
import java.time.Duration;
import java.util.Set;
import org.openqa.selenium.Alert;
import org.openqa.selenium.By;
import org.openqa.selenium.SearchContext;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.Test;

@Test(groups = "live")
public final class ActionsAndContextsTest extends BaseUiTest {
  public void seleniumActionsProduceDeterministicEvents() {
    loginAndOpen("/interactions/actions");
    LabPage page = new LabPage(driver());
    Actions actions = new Actions(driver());
    actions.moveToElement(page.testId("actions-hover-target")).perform();
    page.testId("hover-menu-item").click();
    actions.doubleClick(page.testId("actions-double-click"))
        .contextClick(page.testId("actions-context-click"))
        .clickAndHold(page.testId("actions-hold-target")).pause(Duration.ofMillis(900)).release().perform();
    String events = page.testId("actions-event-log").getText();
    assertTrue(events.contains("Hidden hover action clicked"));
    assertTrue(events.contains("Double click"));
    assertTrue(events.contains("Context click"));
    assertTrue(events.contains("Hold completed"));
  }

  public void handlesAlertsWindowsFramesAndShadowRoots() {
    loginAndOpen("/alerts");
    new LabPage(driver()).clickButton("JavaScript alert");
    Alert alert = new WebDriverWait(driver(), Duration.ofSeconds(3)).until(ExpectedConditions.alertIsPresent());
    assertEquals(alert.getText(), "Deterministic JavaScript alert");
    alert.accept();

    driver().get(TestConfig.get().browserUrl("/windows"));
    String parent = driver().getWindowHandle();
    new LabPage(driver()).clickButton("Open new tab");
    new WebDriverWait(driver(), Duration.ofSeconds(5)).until(d -> d.getWindowHandles().size() == 2);
    Set<String> handles = driver().getWindowHandles();
    driver().switchTo().window(handles.stream().filter(h -> !h.equals(parent)).findFirst().orElseThrow());
    WebElement contextId = new WebDriverWait(driver(), Duration.ofSeconds(5)).until(
        ExpectedConditions.visibilityOfElementLocated(By.cssSelector("[data-testid='context-id']")));
    assertTrue(contextId.getText().contains("tab-one"));
    driver().close();
    driver().switchTo().window(parent);

    driver().get(TestConfig.get().browserUrl("/frames"));
    WebDriverWait frameWait = new WebDriverWait(driver(), Duration.ofSeconds(5));
    frameWait.until(ExpectedConditions.frameToBeAvailableAndSwitchToIt(By.cssSelector("iframe[title='Basic frame']")));
    driver().findElement(By.id("basic-button")).click();
    assertEquals(driver().findElement(By.id("basic-result")).getText(), "Basic action completed");
    driver().switchTo().defaultContent();
    frameWait.until(ExpectedConditions.frameToBeAvailableAndSwitchToIt(By.cssSelector("iframe[title='Nested frame']")));
    frameWait.until(ExpectedConditions.frameToBeAvailableAndSwitchToIt(By.cssSelector("iframe[title='Nested inner frame']")));
    driver().findElement(By.id("inner-button")).click();
    assertEquals(driver().findElement(By.id("inner-result")).getText(), "Inner action completed");
    driver().switchTo().defaultContent();

    driver().get(TestConfig.get().browserUrl("/shadow-dom"));
    WebElement host = new LabPage(driver()).testId("open-shadow-host");
    SearchContext root = host.getShadowRoot();
    root.findElement(By.id("shadow-input")).sendKeys("TestNG");
    root.findElement(By.id("shadow-button")).click();
    assertEquals(root.findElement(By.id("shadow-output")).getText(), "Open shadow button clicked");
    SearchContext nested = root.findElement(By.cssSelector("nested-shadow")).getShadowRoot();
    nested.findElement(By.id("nested-button")).click();
    assertEquals(nested.findElement(By.id("nested-output")).getText(), "Nested action completed");
  }
}
