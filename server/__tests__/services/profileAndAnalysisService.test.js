/**
 * src/services/profileService.js and src/services/analysisService.js.
 */
const { createProfileService } = require('../../src/services/profileService');
const { createAnalysisService } = require('../../src/services/analysisService');
const { result } = require('./fakes');

test('isUsernameAvailable: no row → true, a row → false', async () => {
    const profilesRepo = { findUsernameByUsername: jest.fn(() => result(null)) };
    const svc = createProfileService({ profilesRepo });
    expect(await svc.isUsernameAvailable('new')).toBe(true);
    profilesRepo.findUsernameByUsername.mockReturnValue(result({ username: 'bob' }));
    expect(await svc.isUsernameAvailable('bob')).toBe(false);
    expect(profilesRepo.findUsernameByUsername).toHaveBeenLastCalledWith('bob');
});

test('analysePosition: default depth 18 and the engine body as-is', async () => {
    const engineClient = { analyzePosition: jest.fn(async () => ({ json: async () => ({ error: 'bad fen' }) })) };
    const svc = createAnalysisService({ engineClient });
    expect(await svc.analysePosition({ fen: 'F', depth: 0 })).toEqual({ error: 'bad fen' });
    expect(engineClient.analyzePosition).toHaveBeenCalledWith({ fen: 'F', depth: 18 });
    await svc.analysePosition({ fen: 'F', depth: 12 });
    expect(engineClient.analyzePosition).toHaveBeenLastCalledWith({ fen: 'F', depth: 12 });
});
