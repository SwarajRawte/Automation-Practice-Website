package com.testlab.tests;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertThrows;
import static org.testng.Assert.assertTrue;

import com.testlab.config.Browser;
import com.testlab.config.TestConfig;
import com.testlab.core.TestRunContext;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import org.testng.IAttributes;
import org.testng.annotations.Test;

@Test(groups = "unit")
public final class FrameworkConfigurationTest {
  public void parsesSupportedValues() {
    assertEquals(Browser.parse("FireFox"), Browser.FIREFOX);
    assertTrue(TestConfig.strictBoolean("TRUE"));
    assertEquals(TestConfig.positiveInt("12"), 12);
    assertEquals(TestConfig.httpUri("http://localhost:5173").getPort(), 5173);
  }

  public void rejectsUnsafeOrAmbiguousValues() {
    assertThrows(IllegalArgumentException.class, () -> Browser.parse("safari"));
    assertThrows(IllegalArgumentException.class, () -> TestConfig.strictBoolean("yes"));
    assertThrows(IllegalArgumentException.class, () -> TestConfig.positiveInt("0"));
    assertThrows(IllegalArgumentException.class, () -> TestConfig.httpUri("file:///tmp/test"));
  }

  public void keepsParallelSuiteRunIdsIndependent() {
    IAttributes first = new TestAttributes();
    IAttributes second = new TestAttributes();
    TestRunContext.set(first, "run-first");
    TestRunContext.set(second, "run-second");

    assertEquals(TestRunContext.get(first), "run-first");
    assertEquals(TestRunContext.get(second), "run-second");
    TestRunContext.clear(first);
    assertTrue(TestRunContext.find(first).isEmpty());
    assertEquals(TestRunContext.get(second), "run-second");
  }

  private static final class TestAttributes implements IAttributes {
    private final Map<String, Object> attributes = new HashMap<>();

    @Override public Object getAttribute(String name) { return attributes.get(name); }
    @Override public void setAttribute(String name, Object value) { attributes.put(name, value); }
    @Override public Set<String> getAttributeNames() { return attributes.keySet(); }
    @Override public Object removeAttribute(String name) { return attributes.remove(name); }
  }
}
