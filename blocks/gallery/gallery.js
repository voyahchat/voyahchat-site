class Lightbox {
    constructor() {
        this.overlay = null;
        this.images = [];
        this.index = 0;
        this.onKey = this.onKey.bind(this);
        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);
        this.startX = 0;
    }

    init() {
        const groups = new Map();

        document.querySelectorAll('[data-group]').forEach((el) => {
            const group = el.getAttribute('data-group');
            if (!groups.has(group)) {
                groups.set(group, []);
            }
            groups.get(group).push(el);

            el.addEventListener('click', (e) => {
                e.preventDefault();
                const list = groups.get(group);
                this.open(list, list.indexOf(el));
            });
        });
    }

    open(images, index) {
        this.images = images;
        this.index = index;

        if (!this.overlay) {
            this.createOverlay();
        }

        document.body.appendChild(this.overlay);
        this.show();
        document.addEventListener('keydown', this.onKey);
        this.overlay.addEventListener('touchstart', this.onTouchStart, { passive: true });
        this.overlay.addEventListener('touchend', this.onTouchEnd);
    }

    close() {
        this.overlay.remove();
        document.removeEventListener('keydown', this.onKey);
        this.startX = 0;
    }

    prev() {
        this.index = (this.index - 1 + this.images.length) % this.images.length;
        this.show();
    }

    next() {
        this.index = (this.index + 1) % this.images.length;
        this.show();
    }

    show() {
        const href = this.images[this.index].getAttribute('href');
        const alt = this.images[this.index].querySelector('img')?.alt || '';
        this.img.src = href;
        this.img.alt = alt;
        this.counter.textContent = `${this.index + 1} / ${this.images.length}`;
    }

    onKey(e) {
        if (e.key === 'Escape') {
            this.close();
        } else if (e.key === 'ArrowLeft') {
            this.prev();
        } else if (e.key === 'ArrowRight') {
            this.next();
        }
    }

    onTouchStart(e) {
        this.startX = e.touches[0].clientX;
    }

    onTouchEnd(e) {
        const diff = e.changedTouches[0].clientX - this.startX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                this.prev();
            } else {
                this.next();
            }
        }
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'gallery__lightbox';

        this.img = document.createElement('img');
        this.img.className = 'gallery__lightbox-img';

        const content = document.createElement('div');
        content.className = 'gallery__lightbox-content';
        content.appendChild(this.img);

        this.counter = document.createElement('div');
        this.counter.className = 'gallery__lightbox-counter';

        const close = document.createElement('button');
        close.className = 'gallery__lightbox-close';
        close.setAttribute('aria-label', 'Close');
        close.innerHTML = '&times;';
        close.addEventListener('click', () => this.close());

        const prev = document.createElement('button');
        prev.className = 'gallery__lightbox-prev';
        prev.setAttribute('aria-label', 'Previous');
        prev.innerHTML = '&lsaquo;';
        prev.addEventListener('click', () => this.prev());

        const next = document.createElement('button');
        next.className = 'gallery__lightbox-next';
        next.setAttribute('aria-label', 'Next');
        next.innerHTML = '&rsaquo;';
        next.addEventListener('click', () => this.next());

        this.overlay.appendChild(close);
        this.overlay.appendChild(prev);
        this.overlay.appendChild(next);
        this.overlay.appendChild(content);
        this.overlay.appendChild(this.counter);

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });
    }
}

const initGallery = () => {
    if (document.querySelector('[data-group]')) {
        new Lightbox().init();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGallery);
} else {
    initGallery();
}
