package com.testlab.config;

import java.util.Locale;

public enum Browser {
  CHROME, FIREFOX, EDGE;

  public static Browser parse(String value) {
    try {
      return valueOf(value.trim().toUpperCase(Locale.ROOT));
    } catch (RuntimeException error) {
      throw new IllegalArgumentException(
          "Unsupported browser '" + value + "'. Use chrome, firefox, or edge.", error);
    }
  }
}
