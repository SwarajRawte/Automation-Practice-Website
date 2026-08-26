package com.testlab.core;

public record Credentials(String email, String password) {
  public static final Credentials ADMIN = new Credentials("admin@testlab.local", "Admin123!");
  public static final Credentials USER = new Credentials("user@testlab.local", "User123!");
  public static final Credentials VIEWER = new Credentials("viewer@testlab.local", "Viewer123!");
}
