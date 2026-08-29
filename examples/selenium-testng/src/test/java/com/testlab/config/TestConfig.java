package com.testlab.config;

import java.net.URI;
import java.nio.file.Path;
import java.util.Optional;

public final class TestConfig {
  private static final TestConfig INSTANCE = new TestConfig();

  private final URI baseUrl = httpUri(setting("test.baseUrl", "BASE_URL", "http://localhost:5173"));
  private final URI apiUrl = httpUri(setting("test.apiUrl", "API_URL", "http://localhost:3100"));
  private final Browser browser = Browser.parse(setting("test.browser", "BROWSER", "chrome"));
  private final Optional<URI> remoteUrl = optionalHttpUri(setting("test.remoteUrl", "SELENIUM_REMOTE_URL", ""));
  private final boolean headless = strictBoolean(setting("test.headless", "HEADLESS", "true"));
  private final int timeoutSeconds = positiveInt(setting("test.timeoutSeconds", "TIMEOUT_SECONDS", "12"));
  private final String testControlKey = setting("test.testControlKey", "TEST_CONTROL_KEY", "testlab-control");
  private final String testRunKey = setting("test.testRunKey", "TEST_RUN_KEY", testControlKey);
  private final Path downloadRoot = Path.of(setting("test.downloadDir", "DOWNLOAD_DIR", "target/downloads"))
      .toAbsolutePath().normalize();

  private TestConfig() {
    if (testControlKey.isBlank()) throw new IllegalArgumentException("TEST_CONTROL_KEY must not be blank");
  }

  public static TestConfig get() { return INSTANCE; }
  public URI baseUrl() { return baseUrl; }
  public URI apiUrl() { return apiUrl; }
  public Browser browser() { return browser; }
  public Optional<URI> remoteUrl() { return remoteUrl; }
  public boolean headless() { return headless; }
  public int timeoutSeconds() { return timeoutSeconds; }
  public String testControlKey() { return testControlKey; }
  public String testRunKey() { return testRunKey; }
  public Path downloadRoot() { return downloadRoot; }

  public String browserUrl(String path) { return baseUrl.resolve(path).toString(); }

  static String setting(String property, String environment, String fallback) {
    String propertyValue = System.getProperty(property);
    if (propertyValue != null && !propertyValue.isBlank()) return propertyValue.trim();
    String environmentValue = System.getenv(environment);
    return environmentValue == null || environmentValue.isBlank() ? fallback : environmentValue.trim();
  }

  public static boolean strictBoolean(String value) {
    if ("true".equalsIgnoreCase(value)) return true;
    if ("false".equalsIgnoreCase(value)) return false;
    throw new IllegalArgumentException("Expected true or false, received: " + value);
  }

  public static int positiveInt(String value) {
    try {
      int parsed = Integer.parseInt(value);
      if (parsed > 0 && parsed <= 300) return parsed;
    } catch (NumberFormatException ignored) {
      // Report one consistent validation message below.
    }
    throw new IllegalArgumentException("Timeout must be an integer from 1 to 300: " + value);
  }

  public static URI httpUri(String value) {
    URI uri = URI.create(value);
    if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
        || uri.getHost() == null) throw new IllegalArgumentException("Expected an absolute HTTP(S) URL: " + value);
    return uri;
  }

  private static Optional<URI> optionalHttpUri(String value) {
    return value.isBlank() ? Optional.empty() : Optional.of(httpUri(value));
  }
}
