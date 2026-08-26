package com.testlab.tests;

import static org.testng.Assert.assertTrue;

import com.testlab.core.BaseUiTest;
import com.testlab.core.Credentials;
import com.testlab.pages.AppShellComponent;
import com.testlab.pages.LoginPage;
import org.testng.annotations.Test;

@Test(groups = "live")
public final class AuthenticationAndRbacTest extends BaseUiTest {
  @Override protected boolean provisionIsolatedUser() { return false; }

  public void protectedReturnUrlRestoresTheAdminPage() {
    LoginPage login = new LoginPage(driver()).openProtected("/admin");
    assertTrue(driver().getCurrentUrl().contains("returnUrl=%2Fadmin"));
    login.login(Credentials.ADMIN);
    new AppShellComponent(driver()).heading("Admin Operations Dashboard");
  }

  public void viewerReceivesAForbiddenPage() {
    new LoginPage(driver()).openProtected("/admin").login(Credentials.VIEWER);
    new AppShellComponent(driver()).heading("403 Forbidden");
  }
}
