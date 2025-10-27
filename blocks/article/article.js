/**
 * Article block JavaScript functionality
 * Handles code block copy functionality with accessibility support
 */

(function() {
    'use strict';

    /**
     * Initialize copy buttons for code blocks
     */
    function initCopyButtons() {
        const copyButtons = document.querySelectorAll('.article__code-copy');

        copyButtons.forEach(button => {
            button.addEventListener('click', handleCopyClick);
            button.addEventListener('keydown', handleKeyDown);
        });
    }

    /**
     * Handle copy button click
     * @param {Event} event - Click event
     */
    function handleCopyClick(event) {
        const button = event.currentTarget;
        const codeBlock = button.parentElement;
        const codeElement = codeBlock.querySelector('code');

        if (!codeElement) {
            console.warn('Code element not found in code block');
            return;
        }

        const text = codeElement.textContent || codeElement.innerText;

        copyToClipboard(text, button);
    }

    /**
     * Handle keyboard events for accessibility
     * @param {Event} event - Keyboard event
     */
    function handleKeyDown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.click();
        }
    }

    /**
     * Copy text to clipboard with fallback for older browsers
     * @param {string} text - Text to copy
     * @param {HTMLElement} button - Copy button element
     */
    function copyToClipboard(text, button) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            // Modern browsers with Clipboard API
            navigator.clipboard.writeText(text).then(function() {
                showCopySuccess(button);
            }).catch(function(err) {
                console.error('Failed to copy text: ', err);
                fallbackCopy(text, button);
            });
        } else {
            // Fallback for older browsers
            fallbackCopy(text, button);
        }
    }

    /**
     * Fallback copy method using textarea
     * @param {string} text - Text to copy
     * @param {HTMLElement} button - Copy button element
     */
    function fallbackCopy(text, button) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showCopySuccess(button);
            } else {
                console.error('Failed to copy text using execCommand');
            }
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }

        document.body.removeChild(textArea);
    }

    /**
     * Show visual feedback when code is copied
     * @param {HTMLElement} button - Copy button element
     */
    function showCopySuccess(button) {
        button.classList.add('article__code-copy_copied');
        button.setAttribute('aria-label', 'Code copied to clipboard');
        button.setAttribute('title', 'Code copied!');

        // Reset after 2 seconds
        setTimeout(function() {
            button.classList.remove('article__code-copy_copied');
            button.setAttribute('aria-label', 'Copy code to clipboard');
            button.setAttribute('title', 'Copy code');
        }, 2000);
    }

    /**
     * Initialize when DOM is ready
     */
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCopyButtons);
        } else {
            initCopyButtons();
        }
    }

    // Initialize the module
    init();

})();