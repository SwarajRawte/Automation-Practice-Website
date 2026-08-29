package com.testlab.driver;

import java.nio.file.Path;
import java.util.Optional;
import org.openqa.selenium.WebDriver;

public final class DriverManager {
  private static final ThreadLocal<WebDriver> DRIVERS = new ThreadLocal<>();
  private static final ThreadLocal<Path> DOWNLOADS = new ThreadLocal<>();

  private DriverManager() {}

  public static void start() {
    if (DRIVERS.get() != null) throw new IllegalStateException("A driver already exists on this thread");
    DriverFactory.CreatedDriver created = DriverFactory.create();
    DRIVERS.set(created.driver());
    DOWNLOADS.set(created.downloadDirectory());
  }

  public static WebDriver driver() {
    WebDriver driver = DRIVERS.get();
    if (driver == null) throw new IllegalStateException("No WebDriver is bound to this thread");
    return driver;
  }

  public static Optional<WebDriver> optionalDriver() { return Optional.ofNullable(DRIVERS.get()); }
  public static Path downloadDirectory() { return DOWNLOADS.get(); }

  public static void stop() {
    WebDriver driver = DRIVERS.get();
    try {
      if (driver != null) driver.quit();
    } finally {
      DRIVERS.remove();
      DOWNLOADS.remove();
    }
  }
}
