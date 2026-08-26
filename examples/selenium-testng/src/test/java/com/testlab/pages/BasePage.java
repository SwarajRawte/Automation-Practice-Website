package com.testlab.pages;

import com.testlab.config.TestConfig;
import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

public abstract class BasePage {
  protected final WebDriver driver;
  protected final WebDriverWait wait;

  protected BasePage(WebDriver driver) {
    this.driver = driver;
    this.wait = new WebDriverWait(driver, Duration.ofSeconds(TestConfig.get().timeoutSeconds()));
  }

  public void open(String path) { driver.get(TestConfig.get().browserUrl(path)); }
  public WebElement visible(By by) { return wait.until(ExpectedConditions.visibilityOfElementLocated(by)); }
  public WebElement clickable(By by) { return wait.until(ExpectedConditions.elementToBeClickable(by)); }
  public void clickButton(String name) {
    clickable(By.xpath("//button[normalize-space()='" + name + "']")).click();
  }
}
