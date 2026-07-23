import { describe, expect, it, vi } from 'vitest';
import {
  createCompleteEnrollmentHandler,
  type CompleteEnrollmentDependencies,
} from '../complete-enrollment/handler';

const appOrigin = 'https://pilot.example.com';
const requestId = '13000000-0000-4000-8000-000000000001';

function dependencies(
  overrides: Partial<CompleteEnrollmentDependencies> = {},
): CompleteEnrollmentDependencies {
  return {
    appOrigin,
    authenticate: vi.fn().mockResolvedValue({
      userId: '00000000-0000-0000-0000-000000000101',
      phone: '+8613800138000',
    }),
    complete: vi.fn().mockResolvedValue({
      cohortId: '11000000-0000-0000-0000-000000000001',
    }),
    ...overrides,
  };
}

function validRequest(overrides: RequestInit = {}) {
  return new Request('http://localhost/functions/v1/complete-enrollment', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer verified-user-jwt',
      'Content-Type': 'application/json; charset=utf-8',
      Origin: appOrigin,
    },
    body: JSON.stringify({ requestId }),
    ...overrides,
  });
}

describe('complete-enrollment handler', () => {
  it('authenticates the JWT and completes only the validated request id', async () => {
    const deps = dependencies();

    const response = await createCompleteEnrollmentHandler(deps)(validRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cohortId: '11000000-0000-0000-0000-000000000001',
    });
    expect(deps.authenticate).toHaveBeenCalledWith('Bearer verified-user-jwt');
    expect(deps.complete).toHaveBeenCalledWith({
      requestId,
      userId: '00000000-0000-0000-0000-000000000101',
      phone: '+8613800138000',
    });
    expect(response.headers.get('access-control-allow-origin')).toBe(appOrigin);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects a non-JSON simple POST before authentication or database access', async () => {
    const deps = dependencies();
    const response = await createCompleteEnrollmentHandler(deps)(validRequest({
      headers: {
        Authorization: 'Bearer verified-user-jwt',
        'Content-Type': 'text/plain',
      },
    }));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ error: 'unsupported_media_type' });
    expect(deps.authenticate).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('cancels an oversized chunked body before authentication', async () => {
    const deps = dependencies();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2048));
        controller.enqueue(new Uint8Array(2049));
        controller.enqueue(new Uint8Array(2048));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('http://localhost/functions/v1/complete-enrollment', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer verified-user-jwt',
        'Content-Type': 'application/json',
      },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const response = await createCompleteEnrollmentHandler(deps)(request);

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(deps.authenticate).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('redacts authentication and database failures', async () => {
    const authDeps = dependencies({
      authenticate: vi.fn().mockRejectedValue(new Error('JWT secret user phone')),
    });
    const authResponse = await createCompleteEnrollmentHandler(authDeps)(validRequest());
    expect(authResponse.status).toBe(401);
    expect(await authResponse.text()).toBe('{"error":"unauthorized"}');

    const dbDeps = dependencies({
      complete: vi.fn().mockRejectedValue(new Error('phone_hmac=secret raw database detail')),
    });
    const dbResponse = await createCompleteEnrollmentHandler(dbDeps)(validRequest());
    expect(dbResponse.status).toBe(409);
    expect(await dbResponse.text()).toBe('{"error":"enrollment_failed"}');
  });
});
