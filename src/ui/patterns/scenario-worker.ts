import {
  simulatePublicScenario,
  type PublicScenarioBasis,
} from "@/elections/model/public-scenario";

type Request = {
  requestId: number;
  basis: PublicScenarioBasis;
  swingPoints: number;
  iterations: number;
};

self.onmessage = (event: MessageEvent<Request>) => {
  const { requestId, basis, swingPoints, iterations } = event.data;
  try {
    const result = simulatePublicScenario(basis, swingPoints, iterations);
    self.postMessage({ requestId, runId: basis.runId, result });
  } catch {
    self.postMessage({
      requestId,
      runId: basis.runId,
      error: "Calcolo non disponibile per questi parametri.",
    });
  }
};
