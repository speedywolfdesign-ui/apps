/* ===== DIALOG COMPONENT =====
 * openDialog('id')  — shows .dialog-overlay[id="id"]
 * closeDialog('id') — hides it
 *
 * Markup pattern:
 *
 *   <div class="dialog-overlay" id="myDlg" style="display:none">
 *     <div class="dialog-panel [dialog-panel-sm|lg|xl|fullscreen]">
 *       <div class="dialog-header [dialog-header-lg]">
 *         <div class="dialog-header-text">
 *           <div class="dialog-title">Title</div>
 *           <div class="dialog-subtitle">Optional subtitle</div>
 *         </div>
 *         <div class="dialog-header-actions">
 *           <button class="dialog-action-btn dialog-close" onclick="closeDialog('myDlg')">
 *             <i class="pi pi-times"></i>
 *           </button>
 *         </div>
 *       </div>
 *       <div class="dialog-body"><!-- content --></div>
 *       <div class="dialog-footer">
 *         <button class="btn btn-text" onclick="closeDialog('myDlg')">Cancel</button>
 *         <div class="dialog-footer-right">
 *           <button class="btn btn-secondary">Save Draft</button>
 *           <button class="btn btn-primary">Submit</button>
 *         </div>
 *       </div>
 *     </div>
 *   </div>
 */
(function () {
  window.openDialog = function (id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };

  window.closeDialog = function (id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  /* Close on backdrop click */
  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('dialog-overlay')) {
      closeDialog(e.target.id);
    }
  });

  /* Close on Escape */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.dialog-overlay.is-open').forEach(function (o) {
      closeDialog(o.id);
    });
  });
})();
