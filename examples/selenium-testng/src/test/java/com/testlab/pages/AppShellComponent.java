package com.testlab.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

public final class AppShellComponent extends BasePage {
  public AppShellComponent(WebDriver driver) { super(driver); }
  public WebElement userMenu() { return visible(By.cssSelector("[data-testid='user-menu']")); }
  public WebElement heading(String text) {
    return visible(By.xpath("//*[self::h1 or self::h2][normalize-space()='" + text + "']"));
  }
}
