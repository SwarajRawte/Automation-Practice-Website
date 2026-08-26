package com.testlab.listeners;

import com.testlab.driver.DriverManager;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.testng.ITestListener;
import org.testng.ITestResult;

public final class ScreenshotListener implements ITestListener {
  @Override
  public void onTestFailure(ITestResult result) {
    DriverManager.optionalDriver().filter(TakesScreenshot.class::isInstance).ifPresent(driver -> {
      String name = (result.getTestClass().getRealClass().getSimpleName() + "-" + result.getMethod().getMethodName())
          .replaceAll("[^A-Za-z0-9._-]", "_");
      Path target = Path.of("target", "screenshots", name + ".png");
      try {
        Files.createDirectories(target.getParent());
        Files.write(target, ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES));
        result.setAttribute("failureScreenshot", target.toAbsolutePath().toString());
      } catch (IOException error) {
        result.setAttribute("failureScreenshotError", error.getMessage());
      }
    });
  }
}
