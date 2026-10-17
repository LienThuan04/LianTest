import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { SupabaseStorageService } from './supabase-storage.service';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

describe('SupabaseStorageService removal', () => {
  const origin = 'https://project.supabase.co';
  const prefix = `${origin}/storage/v1/object/public/images/`;
  const remove = jest.fn<
    Promise<{ error: { message: string } | null }>,
    [string[]]
  >();
  let storage: SupabaseStorageService;

  beforeEach(() => {
    remove.mockReset().mockResolvedValue({ error: null });
    const client = { storage: { from: jest.fn(() => ({ remove })) } };
    jest
      .mocked(createClient)
      .mockReturnValue(client as unknown as ReturnType<typeof createClient>);
    storage = new SupabaseStorageService(
      new ConfigService({
        SUPABASE_URL: origin,
        SUPABASE_KEY: 'test-key',
        SUPABASE_NAME_BUCKET: 'images',
      }),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    `https://foreign.example/storage/v1/object/public/images/questions/a.png`,
    `https://project.supabase.co.attacker.example/storage/v1/object/public/images/questions/a.png`,
    `http://project.supabase.co/storage/v1/object/public/images/questions/a.png`,
    `https://project.supabase.co:8443/storage/v1/object/public/images/questions/a.png`,
    `https://user:password@project.supabase.co/storage/v1/object/public/images/questions/a.png`,
    `${origin}/storage/v1/object/public/other/questions/a.png`,
    `${origin}/wrong/storage/v1/object/public/images/questions/a.png`,
    `/storage/v1/object/public/images/questions/a.png`,
    `${prefix}questions/%ZZ.png`,
    `${prefix}questions/%2e%2e/../a.png`,
    `${prefix}questions/%00.png`,
    `${prefix}`,
    'ANHSV.png',
  ])(
    'ignores URLs outside configured ownership or malformed paths: %s',
    async (url) => {
      await storage.remove(url);
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('removes only the decoded object path, excluding URL query and fragment', async () => {
    await storage.remove(`${prefix}questions/a%20b.png?download=1#preview`);
    expect(remove).toHaveBeenCalledWith(['questions/a b.png']);
  });

  it('logs returned storage errors without rejecting', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    remove.mockResolvedValue({ error: { message: 'storage unavailable' } });
    await expect(
      storage.remove(`${prefix}questions/a.png`),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('logs rejected storage requests without rejecting', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    remove.mockRejectedValue(new Error('network unavailable'));
    await expect(
      storage.remove(`${prefix}questions/a.png`),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
