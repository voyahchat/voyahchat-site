/**
 * Unit Tests: Template Optimization
 *
 * Tests for TemplateOptimizer class methods:
 * - removeQuotes()
 * - removeOptionalTags()
 * - removeWhitespace()
 * - optimizeHtml()
 */

const test = require('ava');
const { TemplateOptimizer } = require('../build/build-templates');

// Test removeQuotes()

test('TemplateOptimizer.removeQuotes() - should remove quotes from simple attributes', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<a href="/path" class="link">text</a>';

    // Act
    const result = optimizer.removeQuotes(html);

    // Assert
    t.is(result, '<a href=/path class=link>text</a>');
});

test('TemplateOptimizer.removeQuotes() - should keep quotes for multi-word values', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<div class="btn btn-primary">text</div>';

    // Act
    const result = optimizer.removeQuotes(html);

    // Assert
    t.is(result, '<div class="btn btn-primary">text</div>');
});

test('TemplateOptimizer.removeQuotes() - should keep quotes for values with spaces', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<img alt="Image description" src="/image.jpg">';

    // Act
    const result = optimizer.removeQuotes(html);

    // Assert
    t.is(result, '<img alt="Image description" src=/image.jpg>');
});

test('TemplateOptimizer.removeQuotes() - should keep quotes for values with special chars', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<input type="text" value="test=value">';

    // Act
    const result = optimizer.removeQuotes(html);

    // Assert
    t.is(result, '<input type=text value="test=value">');
});

test('TemplateOptimizer.removeQuotes() - should remove quotes from Nunjucks variables', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<link href="{{ page.css }}" rel="stylesheet">';

    // Act
    const result = optimizer.removeQuotes(html);

    // Assert
    t.is(result, '<link href={{ page.css }} rel=stylesheet>');
});

test('TemplateOptimizer.removeQuotes() - should handle URLs with Nunjucks variables', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<meta content="https://site.ru{{ page.url }}" property="og:url">';

    // Act
    const result = optimizer.removeQuotes(html);

    // Assert
    t.is(result, '<meta content=https://site.ru{{ page.url }} property=og:url>');
});

test('TemplateOptimizer.removeQuotes() - should remove quotes from script src with Nunjucks variable', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<script src="{{ page.js }}"></script>';

    // Act
    const result = optimizer.removeQuotes(html);

    // Assert
    t.is(result, '<script src={{ page.js }}></script>');
});

// Test removeOptionalTags()

test('TemplateOptimizer.removeOptionalTags() - should remove </body></html> at end', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<body><div>content</div></body></html>';

    // Act
    const result = optimizer.removeOptionalTags(html);

    // Assert
    t.is(result, '<body><div>content</div>');
});

test('TemplateOptimizer.removeOptionalTags() - should remove </li> before <li>', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<ul><li>item1</li><li>item2</li><li>item3</li></ul>';

    // Act
    const result = optimizer.removeOptionalTags(html);

    // Assert
    t.is(result, '<ul><li>item1<li>item2<li>item3</ul>');
});

test('TemplateOptimizer.removeOptionalTags() - should remove final </li> before </ul>', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<ul><li>item1</li><li>item2</li><li>item3</li></ul>';

    // Act
    const result = optimizer.removeOptionalTags(html);

    // Assert
    t.is(result, '<ul><li>item1<li>item2<li>item3</ul>');
});

test('TemplateOptimizer.removeOptionalTags() - should remove </p> in list items', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<ul><li><p>text</p></li></ul>';

    // Act
    const result = optimizer.removeOptionalTags(html);

    // Assert
    t.is(result, '<ul><li><p>text</ul>');
});

test('TemplateOptimizer.removeOptionalTags() - should remove table closing tags', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<table><thead><tr><th>H1</th><th>H2</th></tr></thead>'
        + '<tbody><tr><td>D1</td><td>D2</td></tr></tbody></table>';

    // Act
    const result = optimizer.removeOptionalTags(html);

    // Assert
    const expected = '<table><thead><tr><th>H1<th>H2</th></tr>'
        + '<tbody><tr><td>D1<td>D2</td></tr></table>';
    t.is(result, expected);
});

test('TemplateOptimizer.removeOptionalTags() - should remove </dt> and </dd> tags', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<dl><dt>Term1</dt><dd>Def1</dd><dt>Term2</dt><dd>Def2</dd></dl>';

    // Act
    const result = optimizer.removeOptionalTags(html);

    // Assert
    t.is(result, '<dl><dt>Term1<dd>Def1<dt>Term2<dd>Def2</dd></dl>');
});

// Test removeComments()

test('TemplateOptimizer.removeComments() - should remove Nunjucks comments', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<div>{# This is a comment #}<span>text</span></div>';

    // Act
    const result = optimizer.removeComments(html);

    // Assert
    t.is(result, '<div><span>text</span></div>');
});

test('TemplateOptimizer.removeComments() - should remove multi-line comments', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<div>{# This is a\nmulti-line\ncomment #}<span>text</span></div>';

    // Act
    const result = optimizer.removeComments(html);

    // Assert
    t.is(result, '<div><span>text</span></div>');
});

test('TemplateOptimizer.removeComments() - should remove multiple comments', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '{# Comment 1 #}<div>{# Comment 2 #}<span>text</span>{# Comment 3 #}</div>';

    // Act
    const result = optimizer.removeComments(html);

    // Assert
    t.is(result, '<div><span>text</span></div>');
});

test('TemplateOptimizer.removeComments() - should not affect Nunjucks variables', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '{# Comment #}<div>{{ variable }}</div>';

    // Act
    const result = optimizer.removeComments(html);

    // Assert
    t.is(result, '<div>{{ variable }}</div>');
});

test('TemplateOptimizer.removeComments() - should not affect Nunjucks tags', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '{# Comment #}{% if condition %}<div>text</div>{% endif %}';

    // Act
    const result = optimizer.removeComments(html);

    // Assert
    t.is(result, '{% if condition %}<div>text</div>{% endif %}');
});

// Test removeWhitespace()

test('TemplateOptimizer.removeWhitespace() - should remove whitespace between tags', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<div>  <span>  text  </span>  </div>';

    // Act
    const result = optimizer.removeWhitespace(html);

    // Assert
    t.is(result, '<div><span>  text  </span></div>');
});

test('TemplateOptimizer.removeWhitespace() - should remove whitespace between HTML and Nunjucks tags', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<div>  {% if condition %}  <span>text</span>  {% endif %}  </div>';

    // Act
    const result = optimizer.removeWhitespace(html);

    // Assert
    t.is(result, '<div>{% if condition %}<span>text</span>{% endif %}</div>');
});

test('TemplateOptimizer.removeWhitespace() - should preserve whitespace in text content', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<p>This is  some  text</p>';

    // Act
    const result = optimizer.removeWhitespace(html);

    // Assert
    t.is(result, '<p>This is  some  text</p>');
});

test('TemplateOptimizer.removeWhitespace() - should remove empty lines', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<div>\n\n<span>text</span>\n\n</div>';

    // Act
    const result = optimizer.removeWhitespace(html);

    // Assert
    t.is(result, '<div><span>text</span></div>');
});

test('TemplateOptimizer.removeWhitespace() - should handle Nunjucks variables', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<div>  {{ variable }}  </div>';

    // Act
    const result = optimizer.removeWhitespace(html);

    // Assert
    t.is(result, '<div>{{ variable }}</div>');
});

// Test optimizeHtml()

test('TemplateOptimizer.optimizeHtml() - should apply all optimizations', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<ul>  <li class="item">  text  </li>  <li class="item">  text  </li>  </ul>';

    // Act
    const result = optimizer.optimizeHtml(html);

    // Assert - all optional </li> tags should be removed for maximum minification
    t.is(result, '<ul><li class=item>  text  <li class=item>  text  </ul>');
});

test('TemplateOptimizer.optimizeHtml() - should handle complex HTML', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = `<table>
  <thead>
    <tr>
      <th class="header">Column 1</th>
      <th class="header">Column 2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="cell">Data 1</td>
      <td class="cell">Data 2</td>
    </tr>
  </tbody>
</table>`;

    // Act
    const result = optimizer.optimizeHtml(html);

    // Assert
    const expected = '<table><thead><tr><th class=header>Column 1</th>'
        + '<th class=header>Column 2</th></tr><tbody><tr><td class=cell>Data 1</td>'
        + '<td class=cell>Data 2</td></tr></table>';
    t.is(result, expected);
});

test('TemplateOptimizer.optimizeHtml() - should preserve Nunjucks syntax', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = `<div class="container">
  {% for item in items %}
    <div class="item">
      <a href="{{ item.url }}" class="link">{{ item.title }}</a>
    </div>
  {% endfor %}
</div>`;

    // Act
    const result = optimizer.optimizeHtml(html);

    // Assert
    const expected = '<div class=container>{% for item in items %}<div class=item>'
        + '<a href={{ item.url }} class=link>{{ item.title }}</a></div>'
        + '{% endfor %}</div>';
    t.is(result, expected);
});

test('TemplateOptimizer.optimizeHtml() - should handle mixed content', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<body>  <ul>  <li>Item 1</li>  <li>Item 2</li>  </ul>  </body>  </html>';

    // Act
    const result = optimizer.optimizeHtml(html);

    // Assert
    t.is(result, '<body><ul><li>Item 1<li>Item 2</ul>');
});

test('TemplateOptimizer.optimizeHtml() - should handle attributes with special characters safely', (t) => {
    // Arrange
    const optimizer = new TemplateOptimizer();
    const html = '<input type="text" data-value="key=value" placeholder="Enter text">';

    // Act
    const result = optimizer.optimizeHtml(html);

    // Assert
    t.is(result, '<input type=text data-value="key=value" placeholder="Enter text">');
});
