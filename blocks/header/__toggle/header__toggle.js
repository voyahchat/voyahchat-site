(function() {
    var page = document.querySelector('.page');
    var menuSwitcher = document.querySelector('.page__menu-switcher');
/*
    var header = document.querySelector('.header');

    var searchInput = document.querySelector('.header__search-input');
    var searchButton = document.querySelector('.header__search-button');

    function toggleState() {
        page.classList.toggle('page_state_search');
        header.classList.toggle('header_opened');
    }

    searchButton.addEventListener('click', function(e) {
        // включен режим поиска, при клике на кнопку поиска надо сделать её type=submit
        if (page.classList.contains('page_state_search')) {
            searchButton.type = 'submit';
        } else {
            setTimeout(function() {
                searchInput.focus();
            }, 0);
            searchButton.type = 'button';
        }

        toggleState();
    });

    document.querySelector('.header__search-close').addEventListener('click', toggleState);
*/
    menuSwitcher.addEventListener('change', function() {
        page.classList.toggle('page_state_menu');
    });

    // Close mobile menu when Escape key is pressed
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && menuSwitcher.checked) {
            menuSwitcher.checked = false;
            menuSwitcher.dispatchEvent(new Event('change'));
        }
    });
})();
