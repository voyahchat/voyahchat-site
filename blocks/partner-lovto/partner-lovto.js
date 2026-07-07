/**
 * Lovto partner banner: play the video once, then reveal the static overlay.
 */
document.querySelector('.partner-lovto__player')?.addEventListener('ended', function() {
    this.closest('.partner-lovto')?.classList.add('partner-lovto_state_ended');
});
