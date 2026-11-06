import { useEffect, useState } from 'react';

declare const __WS_BUILD_ID__: string | null;
const bundledBuildId = typeof __WS_BUILD_ID__ === 'undefined' ? null : __WS_BUILD_ID__;

interface BuildInfo {
  buildId: string | null;
  revision: string | null;
  sourceState: 'clean' | 'modified' | 'unknown';
  packageVersion: string | null;
  backendMatchesBuild: boolean | null;
}

export function BuildStatus({ expectedBuildId = bundledBuildId }: { expectedBuildId?: string | null }) {
  const [info, setInfo] = useState<BuildInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/build', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unavailable');
        const data = (await response.json()) as BuildInfo;
        if (!data || typeof data !== 'object' || typeof data.buildId !== 'string') throw new Error('Unbuilt');
        if (!controller.signal.aborted) setInfo(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUnavailable(true);
      });
    return () => controller.abort();
  }, []);

  const mismatch = info && expectedBuildId && info.buildId !== expectedBuildId;
  const backendChanged = info?.backendMatchesBuild === false;
  return (
    <section className="about-section" aria-label="Build information">
      <h3>Build information</h3>
      {unavailable ? (
        <p>Build identity unavailable. This installation may not have a build manifest.</p>
      ) : !info ? (
        <p>Checking build identity…</p>
      ) : (
        <>
          <p>
            Package {info.packageVersion || 'unknown'} · Source {info.revision?.slice(0, 8) || 'unknown'}
          </p>
          <p>
            {info.sourceState === 'modified'
              ? 'Local modifications'
              : info.sourceState === 'clean'
                ? 'Clean source snapshot'
                : 'Source state unknown'}
          </p>
          <code style={{ overflowWrap: 'anywhere' }}>{info.buildId}</code>
          {mismatch ? (
            <p role="alert">
              This browser and server are using different builds. Reload after saving any work; if this persists, the
              operator should verify the build and restart.
            </p>
          ) : backendChanged ? (
            <p role="alert">
              Server files differ from this build. A rebuild and restart are needed before this can be considered a
              matching release.
            </p>
          ) : expectedBuildId && info.backendMatchesBuild === true ? (
            <p role="status">Build matches this app.</p>
          ) : (
            <p>Build match is not verified for this installation.</p>
          )}
        </>
      )}
    </section>
  );
}
