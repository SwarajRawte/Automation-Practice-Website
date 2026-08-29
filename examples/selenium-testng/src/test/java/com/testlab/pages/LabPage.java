package com.testlab.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

public final class LabPage extends BasePage {
  public LabPage(WebDriver driver) { super(driver); }
  public WebElement testId(String id) { return visible(By.cssSelector("[data-testid='" + id + "']")); }
  public WebElement named(String name) { return visible(By.name(name)); }
  public WebElement status() { return visible(By.cssSelector("[role='status']")); }
  public WebElement alertRegion() { return visible(By.cssSelector("[role='alert']")); }
}
