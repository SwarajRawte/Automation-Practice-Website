package com.testlab.tests;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import com.testlab.config.TestConfig;
import com.testlab.core.BaseUiTest;
import com.testlab.driver.DriverManager;
import com.testlab.pages.LabPage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.Test;

@Test(groups = "live")
public final class FileTransferTest extends BaseUiTest {
  public void uploadsAndDownloadsDeterministicFiles() throws Exception {
    loginAndOpen("/files/upload");
    Path fixture = Path.of("src", "test", "resources", "files", "upload-sample.txt").toAbsolutePath();
    driver().findElement(By.cssSelector("input[type='file']")).sendKeys(fixture.toString());
    new LabPage(driver()).clickButton("Upload");
    new WebDriverWait(driver(), Duration.ofSeconds(8)).until(
        d -> d.findElement(By.cssSelector("[role='status']")).getText().contains("1 file(s) uploaded"));
    new WebDriverWait(driver(), Duration.ofSeconds(8)).until(
        d -> d.findElements(By.xpath("//li[contains(.,'upload-sample.txt')]")).stream()
            .anyMatch(element -> element.isDisplayed()));

    if (TestConfig.get().remoteUrl().isPresent()) return;
    Path downloaded = DriverManager.downloadDirectory().resolve("test-lab-download.txt");
    Files.deleteIfExists(downloaded);
    driver().get(TestConfig.get().browserUrl("/files/download"));
    new LabPage(driver()).clickButton("Download text");
    new WebDriverWait(driver(), Duration.ofSeconds(8)).until(d -> Files.exists(downloaded));
    assertEquals(Files.readString(downloaded), "Deterministic E2E Test Lab download\n");
  }
}
