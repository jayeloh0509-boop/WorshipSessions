import { render, screen } from '@testing-library/react';
import { BuildStatus } from '../BuildStatus';

const response = {
  buildId: 'ws-test-build',
  revision: 'a'.repeat(40),
  sourceState: 'modified',
  packageVersion: '1.22.1',
  backendMatchesBuild: true,
};

afterEach(() => vi.unstubAllGlobals());

it('shows the package/build identity without mislabelling it as a new release', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
  render(<BuildStatus expectedBuildId="ws-test-build" />);
  expect(await screen.findByText(/Build matches this app/i)).toBeInTheDocument();
  expect(screen.getByText(/Local modifications/i)).toBeInTheDocument();
  expect(screen.getByText(/Package 1.22.1/i)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('warns about a stale browser or backend instead of claiming the deployed build is current', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
  render(<BuildStatus expectedBuildId="ws-other-build" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/different builds/i);
});

it('warns when server source changed after the frontend was built', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...response, backendMatchesBuild: false }) }),
  );
  render(<BuildStatus expectedBuildId="ws-test-build" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/server files differ/i);
});

it('reports unavailable identity safely on network failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private local details')));
  render(<BuildStatus expectedBuildId="ws-test-build" />);
  expect(await screen.findByText(/Build identity unavailable/i)).toBeInTheDocument();
  expect(screen.queryByText(/private local details/i)).not.toBeInTheDocument();
});
