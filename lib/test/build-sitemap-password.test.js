/**
 * Test: Password in Title Generation
 *
 * Tests that the dynamic password is correctly prepended to the title
 * of the /common/password page when password.json exists.
 */

const test = require('ava');
const fs = require('fs');
const path = require('path');
const { processSitemap } = require('../build/build-sitemap');
const { TestDir } = require('./test-dir');

test('SitemapBuilder.processSitemap - should prepend password to title for /common/password page', async (t) => {
    // Create test directory
    const testDir = new TestDir();

    // Create password.json file
    const passwordData = {
        password: '21313',
        updated: '2026-01-17T10:00:00.000Z',
        validFrom: '2026-01-17T07:00:00.000Z',
        validTo: '2026-01-18T07:00:00.000Z',
    };

    const passwordJsonPath = path.join(testDir.getContent(), 'common', 'password.json');
    fs.mkdirSync(path.dirname(passwordJsonPath), { recursive: true });
    fs.writeFileSync(passwordJsonPath, JSON.stringify(passwordData, null, 2));

    // Create sitemap structure with password page
    const items = [
        'VoyahChat [/, index.md]',
        { 'Common [/common, common/index.md]': ['Пароль инженерного меню [password, common/password.md]'] },
    ];

    // Process sitemap
    const result = processSitemap(items, '', testDir);

    // Check that password page title has password prepended
    const passwordPage = result.pages['/common/password'];
    t.truthy(passwordPage, 'Password page should exist');
    t.is(passwordPage.title, '21313 | Пароль инженерного меню | Common | VoyahChat');

    // Check that other pages are not affected
    const commonPage = result.pages['/common'];
    t.is(commonPage.title, 'Common | VoyahChat');

    const rootPage = result.pages['/'];
    t.is(rootPage.title, 'VoyahChat');
});

test('SitemapBuilder.processSitemap - should work without password.json', async (t) => {
    // Create test directory without password.json
    const testDir = new TestDir();

    // Create sitemap structure with password page
    const items = [
        'VoyahChat [/, index.md]',
        { 'Common [/common, common/index.md]': ['Пароль инженерного меню [password, common/password.md]'] },
    ];

    // Process sitemap
    const result = processSitemap(items, '', testDir);

    // Check that password page title is normal when no password.json exists
    const passwordPage = result.pages['/common/password'];
    t.is(passwordPage.title, 'Пароль инженерного меню | Common | VoyahChat');
});

test('SitemapBuilder.processSitemap - should handle invalid password.json gracefully', async (t) => {
    // Create test directory
    const testDir = new TestDir();

    // Create invalid password.json file
    const passwordJsonPath = path.join(testDir.getContent(), 'common', 'password.json');
    fs.mkdirSync(path.dirname(passwordJsonPath), { recursive: true });
    fs.writeFileSync(passwordJsonPath, 'invalid json');

    // Create sitemap structure with password page
    const items = [
        'VoyahChat [/, index.md]',
        { 'Common [/common, common/index.md]': ['Пароль инженерного меню [password, common/password.md]'] },
    ];

    // Process sitemap - should not throw
    const result = processSitemap(items, '', testDir);

    // Check that password page title is normal when password.json is invalid
    const passwordPage = result.pages['/common/password'];
    t.is(passwordPage.title, 'Пароль инженерного меню | Common | VoyahChat');
});
