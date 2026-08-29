package com.testlab.core;

import java.util.Optional;
import org.testng.IAttributes;
import org.testng.Reporter;

public final class TestRunContext {
  private static final String ATTRIBUTE = TestRunContext.class.getName() + ".runId";

  private TestRunContext() {}

  public static String get() {
    var result = Reporter.getCurrentTestResult();
    if (result == null || result.getTestContext() == null) {
      throw new IllegalStateException("No current TestNG suite is available");
    }
    return get(result.getTestContext().getSuite());
  }

  public static String get(IAttributes suite) {
    return find(suite).orElseThrow(
        () -> new IllegalStateException("The TestNG suite has not created an isolated test run"));
  }

  public static Optional<String> find(IAttributes suite) {
    Object value = suite.getAttribute(ATTRIBUTE);
    return value instanceof String && !((String) value).isBlank()
        ? Optional.of((String) value)
        : Optional.empty();
  }

  public static void set(IAttributes suite, String value) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException("The isolated test run id must not be blank");
    }
    suite.setAttribute(ATTRIBUTE, value);
  }

  public static void clear(IAttributes suite) {
    suite.removeAttribute(ATTRIBUTE);
  }
}
