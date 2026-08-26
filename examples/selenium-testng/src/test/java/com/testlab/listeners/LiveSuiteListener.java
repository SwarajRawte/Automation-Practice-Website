package com.testlab.listeners;

import com.testlab.api.TestLabApi;
import com.testlab.core.TestRunContext;
import java.util.function.Consumer;
import org.testng.IAttributes;
import org.testng.ISuite;
import org.testng.ISuiteListener;

public final class LiveSuiteListener implements ISuiteListener {
  @Override
  public void onStart(ISuite suite) {
    try {
      TestLabApi api = new TestLabApi();
      TestRunContext.set(suite, api.createRun("testng-" + suite.getName()));
    } catch (RuntimeException error) {
      throw new IllegalStateException(
          "Live TestNG suite setup failed. Start the app with TEST_MODE=true and verify API_URL/TEST_RUN_KEY/TEST_CONTROL_KEY.", error);
    }
  }

  @Override
  public void onFinish(ISuite suite) {
    finishRun(suite, runId -> new TestLabApi().deleteRun(runId));
  }

  static void finishRun(IAttributes suite, Consumer<String> deleteRun) {
    var runId = TestRunContext.find(suite);
    if (runId.isEmpty()) return;
    try {
      deleteRun.accept(runId.orElseThrow());
    } finally {
      TestRunContext.clear(suite);
    }
  }
}
