package com.testlab.listeners;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertThrows;
import static org.testng.Assert.assertTrue;

import com.testlab.core.TestRunContext;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.testng.IAttributes;
import org.testng.annotations.Test;

@Test(groups = "unit")
public final class LiveSuiteListenerTest {
  public void finishAfterFailedStartIsANoOp() {
    IAttributes suite = new TestAttributes();
    AtomicInteger deleteCalls = new AtomicInteger();

    LiveSuiteListener.finishRun(suite, ignored -> deleteCalls.incrementAndGet());

    assertEquals(deleteCalls.get(), 0);
    assertTrue(TestRunContext.find(suite).isEmpty());
  }

  public void cleanupClearsContextEvenWhenDeletionFails() {
    IAttributes suite = new TestAttributes();
    TestRunContext.set(suite, "run-to-delete");

    assertThrows(IllegalStateException.class, () ->
        LiveSuiteListener.finishRun(suite, ignored -> {
          throw new IllegalStateException("delete failed");
        }));
    assertTrue(TestRunContext.find(suite).isEmpty());
  }

  private static final class TestAttributes implements IAttributes {
    private final Map<String, Object> attributes = new HashMap<>();

    @Override public Object getAttribute(String name) { return attributes.get(name); }
    @Override public void setAttribute(String name, Object value) { attributes.put(name, value); }
    @Override public Set<String> getAttributeNames() { return attributes.keySet(); }
    @Override public Object removeAttribute(String name) { return attributes.remove(name); }
  }
}
