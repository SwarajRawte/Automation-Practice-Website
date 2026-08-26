package com.testlab.driver;

import com.testlab.config.Browser;
import com.testlab.config.TestConfig;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import org.openqa.selenium.Capabilities;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.edge.EdgeDriver;
import org.openqa.selenium.edge.EdgeOptions;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.firefox.FirefoxOptions;
import org.openqa.selenium.remote.LocalFileDetector;
import org.openqa.selenium.remote.RemoteWebDriver;

final class DriverFactory {
  record CreatedDriver(WebDriver driver, Path downloadDirectory) {}

  private DriverFactory() {}

  static CreatedDriver create() {
    TestConfig config = TestConfig.get();
    Path downloads = config.downloadRoot().resolve("thread-" + Thread.currentThread().getId());
    try { Files.createDirectories(downloads); }
    catch (IOException error) { throw new IllegalStateException("Cannot create download directory " + downloads, error); }

    Capabilities options = options(config.browser(), config.headless(), downloads, config.remoteUrl().isPresent());
    WebDriver driver = config.remoteUrl().isPresent()
        ? remote(config.remoteUrl().orElseThrow(), options)
        : local(config.browser(), options);
    driver.manage().timeouts().implicitlyWait(Duration.ZERO);
    driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(45));
    driver.manage().window().setSize(new org.openqa.selenium.Dimension(1440, 1000));
    return new CreatedDriver(driver, downloads);
  }

  private static Capabilities options(Browser browser, boolean headless, Path downloads, boolean remote) {
    Map<String, Object> chromiumPrefs = new HashMap<>();
    chromiumPrefs.put("download.default_directory", downloads.toString());
    chromiumPrefs.put("download.prompt_for_download", false);
    chromiumPrefs.put("safebrowsing.enabled", true);
    if (browser == Browser.FIREFOX) {
      FirefoxOptions options = new FirefoxOptions();
      if (headless) options.addArguments("-headless");
      options.addPreference("browser.download.folderList", 2);
      options.addPreference("browser.download.dir", downloads.toString());
      options.addPreference("browser.helperApps.neverAsk.saveToDisk", "text/plain,text/csv,application/pdf");
      if (remote) options.setCapability("se:downloadsEnabled", true);
      return options;
    }
    if (browser == Browser.EDGE) {
      EdgeOptions options = new EdgeOptions();
      if (headless) options.addArguments("--headless=new");
      options.addArguments("--window-size=1440,1000");
      options.setExperimentalOption("prefs", chromiumPrefs);
      if (remote) options.setCapability("se:downloadsEnabled", true);
      return options;
    }
    ChromeOptions options = new ChromeOptions();
    if (headless) options.addArguments("--headless=new");
    options.addArguments("--window-size=1440,1000");
    options.setExperimentalOption("prefs", chromiumPrefs);
    if (remote) options.setCapability("se:downloadsEnabled", true);
    return options;
  }

  private static WebDriver local(Browser browser, Capabilities options) {
    return switch (browser) {
      case CHROME -> new ChromeDriver((ChromeOptions) options);
      case FIREFOX -> new FirefoxDriver((FirefoxOptions) options);
      case EDGE -> new EdgeDriver((EdgeOptions) options);
    };
  }

  private static WebDriver remote(java.net.URI uri, Capabilities options) {
    RemoteWebDriver driver = new RemoteWebDriver(toUrl(uri), options);
    driver.setFileDetector(new LocalFileDetector());
    return driver;
  }

  private static java.net.URL toUrl(java.net.URI uri) {
    try { return uri.toURL(); }
    catch (java.net.MalformedURLException error) { throw new IllegalArgumentException("Invalid remote URL", error); }
  }
}
