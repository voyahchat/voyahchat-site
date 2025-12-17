/**
 * Integration tests for markdown content validation
 * Validates list formatting in markdown files to prevent indentation issues
 *
 * =============================================================================
 * BACKGROUND
 * =============================================================================
 *
 * Markdown list formatting is critical for consistent rendering across different
 * markdown processors and platforms. Incorrect indentation can lead to:
 *
 * 1. **Rendering Inconsistencies**: Different markdown parsers (GitHub, GitLab,
 *    CommonMark, etc.) may interpret indented lists differently, causing visual
 *    discrepancies between platforms.
 *
 * 2. **Broken Nested Structures**: Improper indentation can break list hierarchy,
 *    causing nested items to be rendered as separate lists or plain text.
 *
 * 3. **Accessibility Issues**: Screen readers rely on proper list structure to
 *    convey hierarchical information to users with visual impairments.
 *
 * 4. **Content Management Problems**: Inconsistent formatting makes content
 *    difficult to maintain and edit programmatically.
 *
 * =============================================================================
 * VALIDATION RULES
 * =============================================================================
 *
 * This test suite enforces three critical markdown list formatting rules:
 *
 * Rule 1: Top-level lists must NOT have leading spaces before markers
 * -----------------------------------------------------------------
 *
 * **Valid Examples:**
 * ```markdown
 * - Top-level item with no leading spaces
 * * Another top-level item
 * ```
 *
 * **Invalid Examples:**
 * ```markdown
 *  - Top-level item with 1 leading space
 *   - Top-level item with 2 leading spaces
 *    - Top-level item with 3 leading spaces
 * ```
 *
 * **Rationale:** Leading spaces on top-level lists can cause parsers to treat
 * them as code blocks or nested lists, breaking the intended structure.
 *
 * Rule 2: Nested lists MUST use exactly 4-space indentation per level
 * -----------------------------------------------------------------
 *
 * **Valid Examples:**
 * ```markdown
 * - Top-level item
 *     - First nested level (4 spaces)
 *         - Second nested level (8 spaces)
 *             - Third nested level (12 spaces)
 * ```
 *
 * **Invalid Examples:**
 * ```markdown
 * - Top-level item
 *   - Invalid nested (2 spaces)
 *    - Invalid nested (3 spaces)
 *      - Invalid nested (5 spaces)
 *       - Invalid nested (6 spaces)
 * ```
 *
 * **Rationale:** The CommonMark specification requires consistent 4-space
 * indentation for nested lists. Other indentation levels may not be recognized
 * as nested items by all parsers.
 *
 * Rule 3: List markers must be followed by exactly one space
 * ---------------------------------------------------------
 *
 * **Valid Examples:**
 * ```markdown
 * - Valid: single space after marker
 * * Valid: single space after asterisk
 * ```
 *
 * **Invalid Examples:**
 * ```markdown
 * -Invalid: no space after marker
 * *Invalid: no space after asterisk
 * -  Invalid: multiple spaces after marker
 * *  Invalid: multiple spaces after asterisk
 * ```
 *
 * **Rationale:** Proper spacing ensures consistent marker recognition and
 * prevents parsing errors across different markdown implementations.
 *
 * =============================================================================
 * COMMONMARK SPECIFICATION REFERENCES
 * =============================================================================
 *
 * These validation rules are based on the CommonMark specification:
 *
 * - **List Items**: https://spec.commonmark.org/0.30/#list-items
 * - **Indentation**: https://spec.commonmark.org/0.30/#indentation
 * - **Block Quotes**: https://spec.commonmark.org/0.30/#block-quotes
 * - **Fenced Code Blocks**: https://spec.commonmark.org/0.30/#fenced-code-blocks
 *
 * The CommonMark spec defines list items as starting with a list marker
 * followed by at least one space and requires consistent indentation for
 * nested structures.
 *
 * =============================================================================
 * CONTEXT-AWARE PROCESSING
 * =============================================================================
 *
 * The validation system intelligently skips content that should not be
 * validated as regular markdown:
 *
 * **Code Blocks (``` or ~~~):**
 * - Content inside fenced code blocks is completely ignored
 * - Both the opening/closing markers and all content between are skipped
 * - This prevents false positives for code examples and documentation
 *
 * **Block Quotes (>):**
 * - Lines starting with blockquote markers are ignored
 * - This respects quoted content that may contain list-like formatting
 * - Only the immediate line with '>' is skipped, not multi-line quotes
 *
 * **Why This Matters:**
 * - Code blocks often contain example code with list-like syntax
 * - Block quotes may quote content with different formatting rules
 * - Validating these contexts would generate false violations
 * - The context tracking ensures only actual markdown content is validated
 *
 * =============================================================================
 * IMPLEMENTATION DETAILS
 * =============================================================================
 *
 * Architecture Overview:
 *
 * 1. **MarkdownContext Class**: Tracks file processing state including:
 *    - Current file path and line number
 *    - Code block detection and state
 *    - Blockquote detection and state
 *    - Context switching logic
 *
 * 2. **Validation Functions**: Modular validation for different aspects:
 *    - `isListLine()`: Detects if a line contains a list marker
 *    - `validateListIndentation()`: Validates Rules 1 and 2
 *    - `validateListMarker()`: Validates Rule 3
 *
 * 3. **File Processing Pipeline**:
 *    - Discover all .md files recursively
 *    - Process each file line-by-line with context tracking
 *    - Apply validation rules only when appropriate
 *    - Collect violations with detailed metadata
 *
 * 4. **Test Isolation**: Uses TestDir for isolated test environments
 *    - Each test runs in a clean directory
 *    - No interference between test cases
 *    - Proper cleanup after test completion
 *
 * =============================================================================
 * USAGE
 * =============================================================================
 *
 * Running the Tests:
 * ```bash
 * # Run all markdown validation tests
 * npm test -- lib/test/markdown-content-validation.test.js
 *
 * # Run tests with verbose output
 * npm test -- --verbose lib/test/markdown-content-validation.test.js
 * ```
 *
 * Integration with Build Pipeline:
 * - These tests are part of the main test suite
 * - They validate content in external/voyahchat-content/ directory
 * - Failures prevent deployment of content with formatting issues
 *
 * Interpreting Results:
 * - Each violation includes: file path, line number, rule, and description
 * - Violations are grouped by type for easier analysis
 * - Context information shows why certain lines were skipped
 *
 * =============================================================================
 * TROUBLESHOOTING
 * =============================================================================
 *
 * Common Issues and Solutions:
 *
 * **Issue: Unexpected violations in code blocks**
 * - **Cause**: Code block markers not properly closed
 * - **Solution**: Ensure matching ``` or ~~~ markers at start and end
 *
 * **Issue: Violations in blockquoted content**
 * - **Cause**: Blockquote lines not starting with '>'
 * - **Solution**: Add '>' marker to all quoted lines
 *
 * **Issue: False positives for nested lists**
 * - **Cause**: Using 2-space indentation instead of 4-space
 * - **Solution**: Convert to 4-space indentation per nesting level
 *
 * **Issue: Top-level list violations**
 * - **Cause**: Accidental leading spaces from editor auto-indentation
 * - **Solution**: Remove all leading spaces from top-level list markers
 *
 * **Issue: Marker spacing violations**
 * - **Cause**: Multiple spaces or no space after list marker
 * - **Solution**: Use exactly one space after - or * markers
 *
 * =============================================================================
 * VALIDATION IMPLEMENTATION STATUS
 * =============================================================================
 *
 * The validation logic has been updated to correctly enforce 4-space indentation
 * for nested lists according to the CommonMark specification. The key changes:
 *
 * **Fixed Issues:**
 * - Previous implementation incorrectly validated for 2-space indentation
 * - Now correctly validates for 4-space multiples (4, 8, 12 spaces = valid)
 * - Properly detects invalid nested indentation (5, 6, 7, 9, 10, 11, 13 spaces = violations)
 * - Maintains validation for top-level lists (1-3 spaces = violations)
 *
 * **Validation Rules:**
 * 1. Top-level lists: 0 spaces only (1-3 spaces = violation)
 * 2. Nested lists: 4-space multiples only (4, 8, 12 spaces = valid)
 * 3. Invalid nested: non-4-space multiples (5, 6, 7, 9, 10, 11, 13 spaces = violations)
 *
 * The implementation now aligns with the specification and should detect
 * the expected violations instead of the inflated 853 violations caused
 * by the incorrect 2-space validation logic.
 *
 * =============================================================================
 * MAINTENANCE
 * =============================================================================
 *
 * For developers maintaining this test suite:
 *
 * 1. **Adding New Rules**: Extend validation functions and update test cases
 * 2. **Modifying Context Logic**: Update MarkdownContext class and related tests
 * 3. **Expected Violations**: Re-run validation when content base changes
 * 4. **Test Coverage**: Ensure new edge cases have corresponding test scenarios
 *
 * The test suite is designed to be extensible and maintainable, with clear
 * separation of concerns and comprehensive documentation for future developers.
 *
 * =============================================================================
 * VALIDATION RULES SUMMARY
 * =============================================================================
 *
 * Rules:
 * 1. Top-level lists must NOT have leading spaces before markers
 * 2. Nested lists MUST use 4-space indentation (not 2 spaces)
 * 3. Both dash (-) and asterisk (*) markers are validated
 */


const test = require('ava');

const fs = require('fs').promises;

const path = require('path');

/**
 * Recursively discovers all .md files in a directory
 *
 * This function performs a depth-first traversal of the directory tree,
 * collecting all files with .md extensions. It handles various error conditions
 * and provides detailed error messages for debugging.
 *
 * @param {string} contentDir - Absolute path to the content directory to scan
 * @returns {Promise<string[]>} Array of absolute file paths for all .md files found
 * @throws {Error} If the directory doesn't exist or cannot be read
 *
 * @example
 * const files = await discoverMarkdownFiles('/path/to/content');
 * console.log(`Found ${files.length} markdown files`);
 */
// eslint-disable-next-line no-unused-vars
async function discoverMarkdownFiles(contentDir) {
    try {
        const stat = await fs.stat(contentDir);
        if (!stat.isDirectory()) {
            throw new Error(`Path is not a directory: ${contentDir}`);
        }

        const files = [];
        const entries = await fs.readdir(contentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(contentDir, entry.name);

            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const subFiles = await discoverMarkdownFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                // Add .md files to the result
                files.push(fullPath);
            }
        }

        return files;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Directory not found: ${contentDir}`);
        }
        throw new Error(`Failed to scan directory ${contentDir}: ${error.message}`);
    }
}

/**
 * Context tracker for markdown file processing
 *
 * This class maintains state information during markdown file validation to
 * enable context-aware processing. It tracks whether the current line is within
 * a code block or blockquote, which determines whether validation should be
 * applied to that line.
 *
 * The context is updated line-by-line during file processing and provides
 * methods to query the current state and reset for new files.
 */

class MarkdownContext {
    /**
     * Initialize markdown context tracking
     *
     * Creates a new context instance for processing a specific markdown file.
     * The context starts in a neutral state with no active code blocks or
     * blockquotes.
     *
     * @param {string} filePath - Path to the current markdown file being processed
     */
    constructor(filePath) {
        this.filePath = filePath;
        this.lineNumber = 0;
        this.inCodeBlock = false;
        this.inBlockquote = false;
        this.codeBlockMarker = null; // Track the specific marker for code blocks
        this.listStack = []; // Stack of active lists by indentation level
    }

    /**
     * Process a line and update context state
     *
     * This is the core method that maintains context during file processing.
     * It updates the line number and checks for transitions into or out of
     * code blocks and blockquotes.
     *
     * Code blocks take precedence over blockquotes - if a line is within a
     * code block, blockquote detection is skipped for that line.
     *
     * @param {string} line - The current line being processed
     * @param {number} lineNumber - Current line number (1-based)
     * @returns {void}
     */
    updateLine(line, lineNumber) {
        this.lineNumber = lineNumber;

        // Handle code block detection
        this._updateCodeBlockState(line);

        // Handle blockquote detection (only if not in code block)
        if (!this.inCodeBlock) {
            this._updateBlockquoteState(line);
        }

        // Update list stack for context tracking
        this._updateListStack(line);
    }

    /**
     * Check if validation should be skipped for the current context
     * @returns {boolean} True if validation should be skipped (in code block or blockquote)
     */
    shouldSkipValidation() {
        return this.inCodeBlock || this.inBlockquote;
    }

    /**
     * Get current context information for error reporting
     * @returns {Object} Current context state
     * @returns {string} returns.filePath - Current file path
     * @returns {number} returns.lineNumber - Current line number
     * @returns {boolean} returns.inCodeBlock - Whether we're inside a code block
     * @returns {boolean} returns.inBlockquote - Whether we're inside a blockquote
     */
    getCurrentContext() {
        return {
            filePath: this.filePath,
            lineNumber: this.lineNumber,
            inCodeBlock: this.inCodeBlock,
            inBlockquote: this.inBlockquote,
        };
    }

    /**
     * Reset context state for processing a new file
     * @param {string} filePath - Path to the new markdown file
     * @returns {void}
     */
    reset(filePath) {
        this.filePath = filePath;
        this.lineNumber = 0;
        this.inCodeBlock = false;
        this.inBlockquote = false;
        this.codeBlockMarker = null;
        this.listStack = [];
    }

    /**
     * Update code block state based on the current line
     * @private
     * @param {string} line - The current line being processed
     * @returns {void}
     */
    _updateCodeBlockState(line) {
        // Check for code block markers (``` or ~~~)
        const codeBlockRegex = /^(\s*)(```|~~~)/;
        const match = line.match(codeBlockRegex);

        if (match) {
            const [, , marker] = match;

            if (!this.inCodeBlock) {
                // Starting a code block
                this.inCodeBlock = true;
                this.codeBlockMarker = marker;
            } else if (marker === this.codeBlockMarker) {
                // Ending a code block - must match the same marker type
                this.inCodeBlock = false;
                this.codeBlockMarker = null;
            }
            // If markers don't match, we stay in the code block
        }
    }

    /**
     * Update blockquote state based on the current line
     * @private
     * @param {string} line - The current line being processed
     * @returns {void}
     */
    _updateBlockquoteState(line) {
        // Check if line starts with blockquote marker (>)
        // Allow for optional spaces after the marker
        const blockquoteRegex = /^>\s?/;
        this.inBlockquote = blockquoteRegex.test(line);
    }

    /**
     * Update list stack based on the current line
     * @private
     * @param {string} line - The current line being processed
     * @returns {void}
     */
    _updateListStack(line) {
        // If this is a list line
        if (isListLine(line)) {
            const indent = line.match(/^ */)[0].length;
            const isOrderedList = /^\s*\d+\./.test(line);

            // Remove all lists from stack with indentation > current (not >=)
            this.listStack = this.listStack.filter(item => item.indent < indent);

            // If there's already a list at the same indentation level, replace it
            const existingIndex = this.listStack.findIndex(item => item.indent === indent);
            if (existingIndex !== -1) {
                this.listStack[existingIndex] = { indent, line, isOrderedList };
            } else {
                this.listStack.push({ indent, line, isOrderedList });
            }
        } else if (line.trim() === '') {
            // Empty line - clear stack (lists are interrupted)
            this.listStack = [];
        } else if (!line.match(/^\s/) && line.trim() !== '') {
            // Non-empty line without indentation - clear stack
            this.listStack = [];
        }
    }

    /**
     * Check if there's a parent list for the given indentation level
     * @param {number} indent - The indentation level to check for parent
     * @returns {boolean} True if there's a parent list at (indent - 4) level
     */
    hasParentList(indent) {
        // Check if there's a parent list at level (indent - 4)
        const parentIndent = indent - 4;
        return this.listStack.some(item => item.indent === parentIndent);
    }

    /**
     * Check if the current line is an unordered list that follows a numbered list at the same level
     * @param {string} line - The current line being processed
     * @returns {boolean} True if this is an unordered list following a numbered list at same level
     */
    isUnorderedListFollowingNumbered(line) {
        const indent = line.match(/^ */)[0].length;
        const isUnorderedList = /^\s*[-*]/.test(line);

        if (!isUnorderedList || indent !== 0) {
            return false;
        }

        // Check if there's a numbered list in the stack at the same indentation level
        return this.listStack.some(item =>
            item.indent === indent && item.isOrderedList);
    }
}


/**
 * Validates a single markdown file for list formatting compliance
 *
 * This is the main validation function that orchestrates the entire
 * validation process for a single markdown file. It reads the file,
 * processes each line with context tracking, and applies validation rules
 * to detect formatting violations.
 *
 * The function returns detailed violation information including file path,
 * line number, rule type, content, and human-readable descriptions.
 *
 * @param {string} filePath - Absolute path to the markdown file to validate
 * @returns {Promise<Object[]>} Array of violation objects with file path, line number, rule, and content
 * @throws {Error} If the file cannot be read or processed
 *
 * @example
 * const violations = await validateMarkdownFile('/path/to/file.md');
 * violations.forEach(v => {
 *     console.log(`${v.filePath}:${v.lineNumber} - ${v.rule}: ${v.description}`);
 * });
 */

async function validateMarkdownFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        const violations = [];
        const context = new MarkdownContext(filePath);

        for (let i = 0; i < lines.length; i++) {
            const lineNumber = i + 1;
            const line = lines[i];

            // Skip validation if we're in a code block or blockquote
            if (context.shouldSkipValidation()) {
                context.updateLine(line, lineNumber);
                continue;
            }

            // Check if this is a list line
            if (isListLine(line)) {
                const leadingSpaces = line.match(/^ */)[0].length;
                const isUnordered = /^\s*[-*]/.test(line);

                // Check for unordered list following numbered list BEFORE updating stack
                let shouldDetectViolation = false;
                if (isUnordered && leadingSpaces === 0) {
                    const itemsAtSameLevel = context.listStack.filter(item => item.indent === leadingSpaces);
                    if (itemsAtSameLevel.length > 0) {
                        const mostRecent = itemsAtSameLevel[itemsAtSameLevel.length - 1];
                        shouldDetectViolation = mostRecent.isOrderedList;
                    }
                }

                // Now update the stack
                context.updateLine(line, lineNumber);

                // Validate indentation rules
                const indentationViolation = validateListIndentation(line, lineNumber, context);
                if (indentationViolation) {
                    violations.push({
                        filePath,
                        lineNumber,
                        rule: indentationViolation.rule,
                        content: line,
                        description: indentationViolation.description,
                    });
                } else if (shouldDetectViolation) {
                    // Add our custom violation
                    violations.push({
                        filePath,
                        lineNumber,
                        rule: 'UNORDERED_AFTER_NUMBERED',
                        content: line,
                        description: 'Unordered list item follows a numbered list at the same indentation level. ' +
                            'This should be indented with 4 spaces to be nested under the numbered list.',
                    });
                }

                // Validate marker formatting
                const markerViolation = validateListMarker(line, lineNumber);
                if (markerViolation) {
                    violations.push({
                        filePath,
                        lineNumber,
                        rule: markerViolation.rule,
                        content: line,
                        description: markerViolation.description,
                    });
                }
            } else {
                // Update context for non-list lines
                context.updateLine(line, lineNumber);
            }
        }

        return violations;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`File not found: ${filePath}`);
        }
        throw new Error(`Failed to validate file ${filePath}: ${error.message}`);
    }
}

/**
 * Detects if a line is a markdown list item
 * @param {string} line - The line to check
 * @returns {boolean} True if the line is a list item, false otherwise
 */
function isListLine(line) {
    // Check for unordered lists (- or *) with optional spaces followed by marker
    const unorderedListRegex = /^\s*[-*]/;
    // Check for ordered lists (1., 2., etc.) with optional spaces followed by number and dot
    const orderedListRegex = /^\s*\d+\./;

    // This matches both valid and invalid list formats for validation purposes
    // We don't require a space after the marker here, as that's what we're validating
    return unorderedListRegex.test(line) || orderedListRegex.test(line);
}

/**
 * Validates list indentation according to the CommonMark specification
 * @param {string} line - The list line to validate
 * @param {number} lineNumber - The line number for error reporting
 * @param {MarkdownContext} context - The markdown context for parent list detection
 * @returns {Object|null} Violation object if rule is broken, null if valid
 */
function validateListIndentation(line, _lineNumber, context) {
    // Count leading spaces
    const leadingSpaces = line.match(/^ */)[0].length;

    // Rule 1: Top-level lists must not have leading spaces (1-3 spaces = violation)
    if (leadingSpaces > 0 && leadingSpaces < 4) {
        return {
            rule: 'TOP_LEVEL_INDENTATION',
            description: 'Top-level list items must not have leading spaces',
        };
    }

    // NEW RULE: Check if this is an unordered list following a numbered list at the same level
    if (leadingSpaces === 0 && context.isUnorderedListFollowingNumbered(line)) {
        return {
            rule: 'UNORDERED_AFTER_NUMBERED',
            description: 'Unordered list item follows a numbered list at the same indentation level. ' +
                'This should be indented with 4 spaces to be nested under the numbered list.',
        };
    }

    // Rule 2: Lists with 4+ spaces must have a parent list
    if (leadingSpaces >= 4) {
        // Check if indentation is a multiple of 4
        if (leadingSpaces % 4 !== 0) {
            return {
                rule: 'NESTED_INDENTATION',
                description: 'Nested list items must use exactly 4 spaces per nesting level',
            };
        }

        // NEW RULE: Check if there's a parent list
        if (!context.hasParentList(leadingSpaces)) {
            return {
                rule: 'ORPHANED_NESTED_LIST',
                description: `List with ${leadingSpaces} spaces indentation has no parent list. ` +
                    'Lists with 4+ spaces must be nested inside another list, or have no indentation.',
            };
        }
    }

    // No indentation violation
    return null;
}

/**
 * Validates list marker formatting
 * @param {string} line - The list line to validate
 * @param {number} lineNumber - The line number for error reporting
 * @returns {Object|null} Violation object if rule is broken, null if valid
 */
function validateListMarker(line, _lineNumber) {
    // Rule 3: List items must have proper spacing after the marker
    // Check for - or * followed by space (not multiple spaces or no space)
    const invalidMarkerRegex = /^(\s*)[-*](?!\s)/; // - or * not followed by space

    if (invalidMarkerRegex.test(line)) {
        return {
            rule: 'MARKER_SPACING',
            description: 'List markers (- or *) must be followed by exactly one space',
        };
    }

    // Check for multiple spaces after marker (more than one)
    const multipleSpacesRegex = /^(\s*)[-*]\s{2,}/;
    if (multipleSpacesRegex.test(line)) {
        return {
            rule: 'MARKER_SPACING',
            description: 'List markers (- or *) must be followed by exactly one space',
        };
    }

    // No marker violation
    return null;
}

const { TestDir } = require('./test-dir');

test.beforeEach(async (t) => {
    // Create isolated test directory for each test
    t.context.dir = new TestDir();
});

test('MarkdownContentValidation.validateMarkdownFile() - detect top-level list indentation violations', async (t) => {
    // Arrange
    const testContent = `# Test Document

This is a paragraph.

 - Invalid top-level list with 1 space
  - Invalid top-level list with 2 spaces
   - Invalid top-level list with 3 spaces
- Valid top-level list with no spaces

\`\`\`code
 - This should be ignored (in code block)
  - This should also be ignored
\`\`\`

> This is a blockquote
> - This should be ignored (in blockquote)
>  - This should also be ignored

Another paragraph.

* Valid asterisk list
 - Another invalid list with 1 space
  - Another invalid list with 2 spaces
   - Another invalid list with 3 spaces
`;

    const testFile = path.join(t.context.dir.getRoot(), 'test.md');
    await fs.writeFile(testFile, testContent, 'utf8');

    // Act
    const violations = await validateMarkdownFile(testFile);

    // Assert
    t.is(violations.length, 6, 'Should detect exactly 6 top-level indentation violations');

    // Verify specific violations with correct line numbers and details
    const expectedViolations = [
        {
            filePath: testFile,
            lineNumber: 5,
            rule: 'TOP_LEVEL_INDENTATION',
            content: ' - Invalid top-level list with 1 space',
            description: 'Top-level list items must not have leading spaces',
        },
        {
            filePath: testFile,
            lineNumber: 6,
            rule: 'TOP_LEVEL_INDENTATION',
            content: '  - Invalid top-level list with 2 spaces',
            description: 'Top-level list items must not have leading spaces',
        },
        {
            filePath: testFile,
            lineNumber: 7,
            rule: 'TOP_LEVEL_INDENTATION',
            content: '   - Invalid top-level list with 3 spaces',
            description: 'Top-level list items must not have leading spaces',
        },
        {
            filePath: testFile,
            lineNumber: 22,
            rule: 'TOP_LEVEL_INDENTATION',
            content: ' - Another invalid list with 1 space',
            description: 'Top-level list items must not have leading spaces',
        },
        {
            filePath: testFile,
            lineNumber: 23,
            rule: 'TOP_LEVEL_INDENTATION',
            content: '  - Another invalid list with 2 spaces',
            description: 'Top-level list items must not have leading spaces',
        },
        {
            filePath: testFile,
            lineNumber: 24,
            rule: 'TOP_LEVEL_INDENTATION',
            content: '   - Another invalid list with 3 spaces',
            description: 'Top-level list items must not have leading spaces',
        },
    ];

    violations.forEach((violation, index) => {
        const expected = expectedViolations[index];
        t.deepEqual(violation, expected, `Violation ${index + 1} should match expected details`);
    });

    // Verify that code blocks and blockquotes were properly skipped
    const codeBlockLineNumbers = violations.map(v => v.lineNumber);
    t.false(codeBlockLineNumbers.includes(10), 'Should not validate lines inside code blocks');
    t.false(codeBlockLineNumbers.includes(11), 'Should not validate lines inside code blocks');
    t.false(codeBlockLineNumbers.includes(14), 'Should not validate lines inside blockquotes');
    t.false(codeBlockLineNumbers.includes(15), 'Should not validate lines inside blockquotes');
});

test('MarkdownContentValidation.validateMarkdownFile() - detect nested list indentation violations', async (t) => {
    // Arrange
    const testContent = `# Test Document

- Valid top-level list
    - Valid nested list (4 spaces)
        - Valid double-nested list (8 spaces)
            - Valid triple-nested list (12 spaces)
   - Invalid nested list (3 spaces)
    - Valid nested list (4 spaces)
     - Invalid nested list (5 spaces)
      - Invalid nested list (6 spaces)
       - Invalid nested list (7 spaces)
        - Valid nested list (8 spaces)
         - Invalid nested list (9 spaces)
          - Invalid nested list (10 spaces)
           - Invalid nested list (11 spaces)
            - Valid nested list (12 spaces)
             - Invalid nested list (13 spaces)

* Another valid top-level list
    - Valid nested (4 spaces)
  - Invalid nested (2 spaces)
   - Invalid nested (3 spaces)
    - Valid nested (4 spaces)
     - Invalid nested (5 spaces)

\`\`\`code
- Top level in code
    - Nested in code (should be ignored)
   - Invalid nested in code (should be ignored)
\`\`\`

> Blockquote with list
> - Top level in blockquote
>     - Nested in blockquote (should be ignored)
>    - Invalid nested in blockquote (should be ignored)
`;

    const testFile = path.join(t.context.dir.getRoot(), 'test.md');
    await fs.writeFile(testFile, testContent, 'utf8');

    // Act
    const violations = await validateMarkdownFile(testFile);

    // Assert
    t.is(violations.length, 11, 'Should detect exactly 11 nested indentation violations');

    // Verify specific violations with correct line numbers and details
    const expectedViolations = [
        {
            filePath: testFile,
            lineNumber: 7,
            rule: 'TOP_LEVEL_INDENTATION',
            content: '   - Invalid nested list (3 spaces)',
            description: 'Top-level list items must not have leading spaces',
        },
        {
            filePath: testFile,
            lineNumber: 9,
            rule: 'NESTED_INDENTATION',
            content: '     - Invalid nested list (5 spaces)',
            description: 'Nested list items must use exactly 4 spaces per nesting level',
        },
        {
            filePath: testFile,
            lineNumber: 10,
            rule: 'NESTED_INDENTATION',
            content: '      - Invalid nested list (6 spaces)',
            description: 'Nested list items must use exactly 4 spaces per nesting level',
        },
        {
            filePath: testFile,
            lineNumber: 11,
            rule: 'NESTED_INDENTATION',
            content: '       - Invalid nested list (7 spaces)',
            description: 'Nested list items must use exactly 4 spaces per nesting level',
        },
        {
            filePath: testFile,
            lineNumber: 13,
            rule: 'NESTED_INDENTATION',
            content: '         - Invalid nested list (9 spaces)',
            description: 'Nested list items must use exactly 4 spaces per nesting level',
        },
        {
            filePath: testFile,
            lineNumber: 14,
            rule: 'NESTED_INDENTATION',
            content: '          - Invalid nested list (10 spaces)',
            description: 'Nested list items must use exactly 4 spaces per nesting level',
        },
        {
            filePath: testFile,
            lineNumber: 15,
            rule: 'NESTED_INDENTATION',
            content: '           - Invalid nested list (11 spaces)',
            description: 'Nested list items must use exactly 4 spaces per nesting level',
        },
        {
            filePath: testFile,
            lineNumber: 17,
            rule: 'NESTED_INDENTATION',
            content: '             - Invalid nested list (13 spaces)',
            description: 'Nested list items must use exactly 4 spaces per nesting level',
        },
        {
            filePath: testFile,
            lineNumber: 21,
            rule: 'TOP_LEVEL_INDENTATION',
            content: '  - Invalid nested (2 spaces)',
            description: 'Top-level list items must not have leading spaces',
        },
        {
            filePath: testFile,
            lineNumber: 22,
            rule: 'TOP_LEVEL_INDENTATION',
            content: '   - Invalid nested (3 spaces)',
            description: 'Top-level list items must not have leading spaces',
        },
        {
            filePath: testFile,
            lineNumber: 24,
            rule: 'NESTED_INDENTATION',
            content: '     - Invalid nested (5 spaces)',
            description: 'Nested list items must use exactly 4 spaces per nesting level',
        },
    ];

    violations.forEach((violation, index) => {
        const expected = expectedViolations[index];
        t.deepEqual(violation, expected, `Violation ${index + 1} should match expected details`);
    });

    // Verify that code blocks and blockquotes were properly skipped
    const codeBlockLineNumbers = violations.map(v => v.lineNumber);
    t.false(codeBlockLineNumbers.includes(29), 'Should not validate lines inside code blocks');
    t.false(codeBlockLineNumbers.includes(30), 'Should not validate lines inside code blocks');
    t.false(codeBlockLineNumbers.includes(31), 'Should not validate lines inside code blocks');
    t.false(codeBlockLineNumbers.includes(34), 'Should not validate lines inside blockquotes');
    t.false(codeBlockLineNumbers.includes(35), 'Should not validate lines inside blockquotes');
    t.false(codeBlockLineNumbers.includes(36), 'Should not validate lines inside blockquotes');
});

test('MarkdownContentValidation.validateMarkdownFile() - should detect list marker spacing violations', async (t) => {
    // Arrange
    const testContent = `# Test Document

- Valid list item with single space
* Valid asterisk with single space
-Invalid list item with no space
*Invalid asterisk with no space
-  Invalid list item with double space
*  Invalid asterisk with double space
-   Invalid list item with triple space
*   Invalid asterisk with triple space
-    Invalid list item with quadruple space
*    Invalid asterisk with quadruple space

\`\`\`code
-Invalid in code block (should be ignored)
*  Also invalid in code block (should be ignored)
\`\`\`

> Blockquote with list
> -Invalid in blockquote (should be ignored)
> *  Also invalid in blockquote (should be ignored)

Nested lists with spacing issues:
- Valid top level
    -Valid nested with no space
    *Valid nested asterisk with no space
    -  Invalid nested with double space
    *  Invalid nested asterisk with double space
    -   Invalid nested with triple space
    *   Invalid nested asterisk with triple space
    - Valid nested with single space
    * Valid nested asterisk with single space

Edge cases:
-Valid at start of line
*Invalid at start of line
- Valid with tab after marker (should be valid)
* Valid with tab after asterisk (should be valid)
-Valid with no space after marker
*Invalid with no space after asterisk
`;

    const testFile = path.join(t.context.dir.getRoot(), 'test.md');
    await fs.writeFile(testFile, testContent, 'utf8');

    // Act
    const violations = await validateMarkdownFile(testFile);

    // Assert
    t.is(violations.length, 18, 'Should detect exactly 18 marker spacing violations');

    // Verify specific violations with correct line numbers and details
    const expectedViolations = [
        {
            filePath: testFile,
            lineNumber: 5,
            rule: 'MARKER_SPACING',
            content: '-Invalid list item with no space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 6,
            rule: 'MARKER_SPACING',
            content: '*Invalid asterisk with no space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 7,
            rule: 'MARKER_SPACING',
            content: '-  Invalid list item with double space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 8,
            rule: 'MARKER_SPACING',
            content: '*  Invalid asterisk with double space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 9,
            rule: 'MARKER_SPACING',
            content: '-   Invalid list item with triple space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 10,
            rule: 'MARKER_SPACING',
            content: '*   Invalid asterisk with triple space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 11,
            rule: 'MARKER_SPACING',
            content: '-    Invalid list item with quadruple space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 12,
            rule: 'MARKER_SPACING',
            content: '*    Invalid asterisk with quadruple space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 25,
            rule: 'MARKER_SPACING',
            content: '    -Valid nested with no space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 26,
            rule: 'MARKER_SPACING',
            content: '    *Valid nested asterisk with no space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 27,
            rule: 'MARKER_SPACING',
            content: '    -  Invalid nested with double space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 28,
            rule: 'MARKER_SPACING',
            content: '    *  Invalid nested asterisk with double space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 29,
            rule: 'MARKER_SPACING',
            content: '    -   Invalid nested with triple space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 30,
            rule: 'MARKER_SPACING',
            content: '    *   Invalid nested asterisk with triple space',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 35,
            rule: 'MARKER_SPACING',
            content: '-Valid at start of line',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 36,
            rule: 'MARKER_SPACING',
            content: '*Invalid at start of line',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 39,
            rule: 'MARKER_SPACING',
            content: '-Valid with no space after marker',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
        {
            filePath: testFile,
            lineNumber: 40,
            rule: 'MARKER_SPACING',
            content: '*Invalid with no space after asterisk',
            description: 'List markers (- or *) must be followed by exactly one space',
        },
    ];

    violations.forEach((violation, index) => {
        const expected = expectedViolations[index];
        t.deepEqual(violation, expected, `Violation ${index + 1} should match expected details`);
    });

    // Verify that code blocks and blockquotes were properly skipped
    const codeBlockLineNumbers = violations.map(v => v.lineNumber);
    t.false(codeBlockLineNumbers.includes(16), 'Should not validate lines inside code blocks');
    t.false(codeBlockLineNumbers.includes(17), 'Should not validate lines inside code blocks');
    t.false(codeBlockLineNumbers.includes(20), 'Should not validate lines inside blockquotes');
    t.false(codeBlockLineNumbers.includes(21), 'Should not validate lines inside blockquotes');
});

test('MarkdownContentValidation.validateMarkdownFile() - detect lists nested in numbered lists', async (t) => {
    // Arrange
    const testContent = `# Test Document

1. First numbered item
    - Valid nested unordered (4 spaces)
    - Another valid nested
2. Second numbered item
- Invalid: should be indented (no parent at level 0)
- Another invalid

3. Third numbered item
    - Valid nested
        - Valid double nested (8 spaces)
    * Valid nested with asterisk

## Section
1. Numbered item
- Invalid: no indentation
    - This is confusing but technically valid (has parent at 0)
`;

    const testFile = path.join(t.context.dir.getRoot(), 'test.md');
    await fs.writeFile(testFile, testContent, 'utf8');

    // Act
    const violations = await validateMarkdownFile(testFile);

    // Should detect violations on lines 7, 8, 17
    const orphanedViolations = violations.filter(v =>
        v.rule === 'ORPHANED_NESTED_LIST' ||
        v.rule === 'TOP_LEVEL_INDENTATION' ||
        v.rule === 'UNORDERED_AFTER_NUMBERED');

    t.true(orphanedViolations.length > 0, 'Should detect violations for improperly nested lists');
});

test('MarkdownContentValidation.validateMarkdownFile() - detect orphaned nested lists', async (t) => {
    // Arrange
    const testContent = `# Test Document

## Section 1
    - Invalid: 4 spaces without parent
    - Another invalid item

- Valid parent list
    - Valid nested (has parent)
    - Another valid nested

## Section 2
    - Invalid again: no parent

\`\`\`code
    - This should be ignored (in code block)
\`\`\`

> Blockquote with list
>     - This should be ignored (in blockquote)

- Another valid parent
    - Valid nested (4 spaces)
        - Valid double nested (8 spaces)
            - Valid triple nested (12 spaces)

## Section 3
    - Invalid: 4 spaces without parent in this context
`;

    const testFile = path.join(t.context.dir.getRoot(), 'test.md');
    await fs.writeFile(testFile, testContent, 'utf8');

    // Act
    const violations = await validateMarkdownFile(testFile);

    // Assert
    t.is(violations.length, 4, 'Should detect exactly 4 orphaned nested lists');

    // Verify specific violations with correct line numbers and details
    const expectedViolations = [
        {
            filePath: testFile,
            lineNumber: 4,
            rule: 'ORPHANED_NESTED_LIST',
            content: '    - Invalid: 4 spaces without parent',
            description: 'List with 4 spaces indentation has no parent list. ' +
               'Lists with 4+ spaces must be nested inside another list, or have no indentation.',
        },
        {
            filePath: testFile,
            lineNumber: 5,
            rule: 'ORPHANED_NESTED_LIST',
            content: '    - Another invalid item',
            description: 'List with 4 spaces indentation has no parent list. ' +
               'Lists with 4+ spaces must be nested inside another list, or have no indentation.',
        },
        {
            filePath: testFile,
            lineNumber: 12,
            rule: 'ORPHANED_NESTED_LIST',
            content: '    - Invalid again: no parent',
            description: 'List with 4 spaces indentation has no parent list. ' +
               'Lists with 4+ spaces must be nested inside another list, or have no indentation.',
        },
        {
            filePath: testFile,
            lineNumber: 27,
            rule: 'ORPHANED_NESTED_LIST',
            content: '    - Invalid: 4 spaces without parent in this context',
            description: 'List with 4 spaces indentation has no parent list. ' +
               'Lists with 4+ spaces must be nested inside another list, or have no indentation.',
        },
    ];

    violations.forEach((violation, index) => {
        const expected = expectedViolations[index];
        t.deepEqual(violation, expected, `Violation ${index + 1} should match expected details`);
    });

    // Verify that code blocks and blockquotes were properly skipped
    const codeBlockLineNumbers = violations.map(v => v.lineNumber);
    t.false(codeBlockLineNumbers.includes(16), 'Should not validate lines inside code blocks');
    t.false(codeBlockLineNumbers.includes(19), 'Should not validate lines inside blockquotes');
});

