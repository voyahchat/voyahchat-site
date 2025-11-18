const test = require('ava');
const { TemplateOptimizer } = require('../build/build-templates');
const { Dir } = require('../build/dir');
const fs = require('fs').promises;
const path = require('path');

test('TemplateOptimizer - should remove unwanted </li> tags in real build', async (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();

    // Act - build templates
    await optimizer.build();

    // Read the generated site/html/index.html
    const siteIndexPath = path.join(Dir.getSiteHtml(), 'index.html');
    const siteHtml = await fs.readFile(siteIndexPath, 'utf8');

    // Assert - check that there are no </li> tags at all (HTML5 optional closing tags)
    const totalLiTags = (siteHtml.match(/<\/li>/gi) || []).length;
    t.is(totalLiTags, 0, 'Should remove all optional </li> tags for maximum minification');

    // Check that the structure is correct - no </li> immediately before </ul>
    const hasLiBeforeUl = /<\/li>\s*<\/ul>/i.test(siteHtml);
    t.false(hasLiBeforeUl, 'Should not find </li> before </ul>');

    // Verify the structure ends properly with ...<footer>...</footer></ul>
    const endsCorrectly = /<\/footer><\/ul>\s*$/i.test(siteHtml.trim());
    t.true(endsCorrectly, 'Should end with </footer></ul>');
});

