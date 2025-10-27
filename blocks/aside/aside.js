/**
 * Aside block JavaScript functionality
 * Handles advertisement rendering with responsive design
 */

(function() {
    'use strict';

    window.yaContextCb = window.yaContextCb || [];

    /**
     * Wait for Yandex Context API to be available
     */
    function waitForYandexContext(maxAttempts = 50, attempt = 0) {
        if (window.Ya && window.Ya.Context && window.Ya.Context.AdvManager) {
            initAds();
        } else if (attempt < maxAttempts) {
            setTimeout(() => {
                waitForYandexContext(maxAttempts, attempt + 1);
            }, 500);
        }
    }

    /**
     * Initialize advertisement functionality
     */
    function initAds() {
        try {
            // Media queries for different screen sizes
            const m1 = matchMedia("(max-width:999px)");
            const m2 = matchMedia("(min-width:1000px) and (max-width:79.99rem)");
            const m3 = matchMedia("(min-width:80rem)");
            let adId = 1;

            /**
             * Render advertisement
             */
            function renderAd() {
                if (window.Ya && window.Ya.Context && window.Ya.Context.AdvManager && window.Ya.Context.AdvManager.render) {
                    window.Ya.Context.AdvManager.render({
                        blockId: "R-A-14126630-1",
                        renderTo: "a" + adId,
                        darkTheme: m3.matches
                    });
                }
            }

            /**
             * Re-render ad when media query changes
             * @param {MediaQueryList} mq - Media query list
             */
            function rerenderAd(mq) {
                if (mq.matches) {
                    // Destroy existing ad if API is available
                    if (window.Ya && window.Ya.Context && window.Ya.Context.AdvManager && window.Ya.Context.AdvManager.destroy) {
                        window.Ya.Context.AdvManager.destroy({
                            blockId: "R-A-14126630-1",
                            renderTo: "a" + adId
                        });
                    }
                    renderAd();
                }
            }

            // Add listeners for media query changes
            m1.addListener(rerenderAd);
            m2.addListener(rerenderAd);
            m3.addListener(rerenderAd);

            // Initial render
            renderAd();
        } catch (error) {
        }
    }

    waitForYandexContext();
})();
