import { openModal } from './modal.js';
import { toast } from './toast.js';
import { escapeHtml, localAsset } from '../lib/helpers.js';

const DEFAULT_STATE = {
  name: '',
  number: '',
  font: 'Deportiva',
  textColor: '#ffffff',
  namePosition: 'center',
  numberPosition: 'center',
  logoPosition: 'left',
  logoUrl: '',
  activeView: 'back'
};

const FONT_MAP = {
  Deportiva: '"Barlow Condensed", Impact, sans-serif',
  'Clásica': 'Georgia, "Times New Roman", serif',
  Moderna: 'Inter, Arial, sans-serif',
  Condensada: '"Arial Narrow", "Barlow Condensed", sans-serif'
};

const TEXT_COLORS = [
  ['#ffffff', 'Blanco'],
  ['#111612', 'Negro'],
  ['#d4af37', 'Dorado'],
  ['#c0c0c0', 'Plateado'],
  ['#c83434', 'Rojo']
];

function normalizePosition(value, fallback = 'center') {
  const normalized = String(value || '').toLowerCase();
  if (normalized.startsWith('izq') || normalized === 'left') return 'left';
  if (normalized.startsWith('der') || normalized === 'right') return 'right';
  if (normalized.startsWith('cent') || normalized === 'center') return 'center';
  return fallback;
}

function normalizeView(value) {
  return value === 'front' || value === 'frontal' ? 'front' : 'back';
}

function normalizeState(value = {}) {
  return {
    ...DEFAULT_STATE,
    name: String(value.name || '').slice(0, 15),
    number: String(value.number || '').replace(/\D/g, '').slice(0, 2),
    font: FONT_MAP[value.font] ? value.font : DEFAULT_STATE.font,
    textColor: /^#[0-9a-f]{6}$/i.test(value.textColor || '') ? value.textColor : DEFAULT_STATE.textColor,
    namePosition: normalizePosition(value.namePosition),
    numberPosition: normalizePosition(value.numberPosition),
    logoPosition: normalizePosition(value.logoPosition, 'left'),
    logoUrl: String(value.logoUrl || ''),
    activeView: normalizeView(value.activeView || value.side)
  };
}

function copyState(state) {
  return { ...state };
}

function positionOptions(selected) {
  return [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']]
    .map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function selectOptions(values, selected) {
  return values.map(value => `<option ${selected === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

function hasCustomization(state) {
  return Boolean(state.name || state.number || state.logoUrl || state.logoFile);
}

export function createProductCustomizer({ product, initialState = null, onApply = () => {} }) {
  let applied = normalizeState(initialState || {});
  let appliedLogoFile = null;
  let frontTemplateUrl = product.front_template_url || '';
  let backTemplateUrl = product.back_template_url || '';
  const objectUrls = new Set();

  if (!frontTemplateUrl || !backTemplateUrl) {
    console.warn(`El producto "${product.name}" no tiene ambas plantillas de personalización; se usará la silueta segura.`);
  }

  function setTemplates({ front = '', back = '' } = {}) {
    frontTemplateUrl = front || product.front_template_url || '';
    backTemplateUrl = back || product.back_template_url || '';
  }

  function getValue() {
    const value = copyState(applied);
    delete value.logoPreviewUrl;
    value.side = value.activeView;
    return value;
  }

  function getLogoFile() {
    return appliedLogoFile;
  }

  function setPersistedLogoUrl(url) {
    applied.logoUrl = url || '';
    appliedLogoFile = null;
  }

  function open(trigger) {
    const draft = copyState(applied);
    draft.logoFile = appliedLogoFile;
    draft.logoPreviewUrl = applied.logoPreviewUrl || applied.logoUrl;

    const wrapper = document.createElement('div');
    wrapper.className = 'customizer';
    wrapper.innerHTML = customizerMarkup(product, draft);
    const modal = openModal({
      title: 'Personaliza tu uniforme',
      content: wrapper,
      className: 'modal--customizer',
      trigger,
      description: 'Visualiza una aproximación. La tienda confirmará el acabado final.'
    });

    const canvas = wrapper.querySelector('[data-customizer-canvas]');
    const template = wrapper.querySelector('[data-template]');
    const fallback = wrapper.querySelector('[data-template-fallback]');
    const nameOverlay = wrapper.querySelector('[data-preview-name]');
    const numberOverlay = wrapper.querySelector('[data-preview-number]');
    const logoOverlay = wrapper.querySelector('[data-preview-logo]');
    const fileInput = wrapper.querySelector('#custom-logo');

    function renderLogoFile() {
      const root = wrapper.querySelector('[data-logo-file]');
      if (!root) return;
      const logoUrl = draft.logoPreviewUrl || draft.logoUrl;
      if (!logoUrl) {
        root.innerHTML = '<span class="customizer-upload__empty">PNG, JPG o WEBP · máximo 5 MB</span>';
        return;
      }
      const fileName = draft.logoFile?.name || 'Logo guardado';
      root.innerHTML = `<img src="${escapeHtml(logoUrl)}" alt="Vista previa del logo"><span><strong>${escapeHtml(fileName)}</strong><small>Solo se mostrará en el frontal</small></span><button type="button" data-remove-logo>Quitar</button>`;
    }

    function renderCustomizationPreview() {
      const isFront = draft.activeView === 'front';
      const templateUrl = isFront ? frontTemplateUrl : backTemplateUrl;
      canvas.dataset.view = draft.activeView;
      canvas.setAttribute('aria-label', `Vista ${isFront ? 'frontal' : 'posterior'} de ${product.name}`);
      template.hidden = !templateUrl;
      fallback.hidden = Boolean(templateUrl);
      if (templateUrl) {
        template.src = localAsset(templateUrl);
        template.alt = `Plantilla ${isFront ? 'frontal' : 'posterior'} de ${product.name}`;
      }

      nameOverlay.textContent = (draft.name || 'TU NOMBRE').toUpperCase();
      nameOverlay.dataset.position = draft.namePosition;
      nameOverlay.dataset.length = draft.name.length > 12 ? 'long' : draft.name.length > 8 ? 'medium' : 'short';
      nameOverlay.hidden = isFront;
      numberOverlay.textContent = draft.number || '10';
      numberOverlay.dataset.position = draft.numberPosition;
      numberOverlay.hidden = isFront;
      [nameOverlay, numberOverlay].forEach(element => {
        element.style.color = draft.textColor;
        element.style.fontFamily = FONT_MAP[draft.font];
      });

      const logoUrl = draft.logoPreviewUrl || draft.logoUrl;
      logoOverlay.hidden = !isFront || !logoUrl;
      logoOverlay.dataset.position = draft.logoPosition;
      if (logoUrl) logoOverlay.src = logoUrl;

      wrapper.querySelectorAll('[data-view]').forEach(button => {
        const active = button.dataset.view === draft.activeView;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      wrapper.querySelectorAll('[data-text-color]').forEach(button => {
        const active = button.dataset.textColor === draft.textColor;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      renderLogoFile();
    }

    function syncField(target) {
      if (target.id === 'custom-name') draft.name = target.value.slice(0, 15);
      if (target.id === 'custom-number') {
        target.value = target.value.replace(/\D/g, '').slice(0, 2);
        draft.number = target.value;
      }
      if (target.id === 'custom-font') draft.font = target.value;
      if (target.id === 'name-position') draft.namePosition = target.value;
      if (target.id === 'number-position') draft.numberPosition = target.value;
      if (['custom-name', 'custom-number', 'custom-font', 'name-position', 'number-position'].includes(target.id)) draft.activeView = 'back';
      renderCustomizationPreview();
    }

    wrapper.addEventListener('input', event => {
      if (event.target.matches('#custom-name,#custom-number')) syncField(event.target);
    });
    wrapper.addEventListener('focusin', event => {
      if (!event.target.closest('.customizer__controls') || !event.target.matches('input,select,button')) return;
      requestAnimationFrame(() => event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    });
    wrapper.addEventListener('change', event => {
      if (event.target.matches('#custom-font,#name-position,#number-position')) syncField(event.target);
      if (event.target.id === 'logo-position') {
        draft.logoPosition = event.target.value;
        draft.activeView = 'front';
        renderCustomizationPreview();
      }
      if (event.target.id === 'custom-logo') {
        const file = event.target.files?.[0];
        if (!file) return;
        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowed.includes(file.type)) {
          toast('Usa un logo PNG, JPG o WEBP.', 'error');
          event.target.value = '';
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast('El logo no debe superar 5 MB.', 'error');
          event.target.value = '';
          return;
        }
        const url = URL.createObjectURL(file);
        objectUrls.add(url);
        draft.logoFile = file;
        draft.logoPreviewUrl = url;
        draft.logoUrl = '';
        draft.activeView = 'front';
        renderCustomizationPreview();
      }
    });
    wrapper.addEventListener('click', event => {
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) draft.activeView = viewButton.dataset.view;

      const colorButton = event.target.closest('[data-text-color]');
      if (colorButton) {
        draft.textColor = colorButton.dataset.textColor;
        draft.activeView = 'back';
      }

      if (event.target.closest('[data-pick-logo]')) fileInput?.click();
      if (event.target.closest('[data-remove-logo]')) {
        draft.logoFile = null;
        draft.logoPreviewUrl = '';
        draft.logoUrl = '';
        if (fileInput) fileInput.value = '';
        draft.activeView = 'front';
      }
      if (event.target.closest('[data-cancel-customization]')) { modal.close(); return; }
      if (event.target.closest('[data-apply-customization]')) {
        applied = normalizeState(draft);
        applied.logoUrl = draft.logoUrl;
        applied.logoPreviewUrl = draft.logoPreviewUrl;
        appliedLogoFile = draft.logoFile || null;
        onApply(getValue(), hasCustomization(draft));
        toast('Personalización aplicada');
        modal.close();
        return;
      }
      renderCustomizationPreview();
    });

    renderCustomizationPreview();
  }

  function destroy() {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls.clear();
  }

  return { open, getValue, getLogoFile, setPersistedLogoUrl, setTemplates, hasCustomization: () => hasCustomization({ ...applied, logoFile: appliedLogoFile }), destroy };
}

function customizerMarkup(product, state) {
  const allowText = product.allow_name || product.allow_number;
  return `<div class="customizer__workspace">
      <section class="customizer__stage" aria-label="Vista previa de la personalización">
        <p class="customizer__intro">Visualiza una aproximación. La tienda confirmará el acabado final.</p>
        <div class="customizer-preview" data-customizer-canvas data-view="${state.activeView}">
          <div class="customizer-artboard">
            <img class="customizer-template" data-template alt="">
            <div class="customizer-shirt-fallback" data-template-fallback aria-hidden="true"></div>
            <strong class="customizer-name" data-preview-name data-position="${state.namePosition}"></strong>
            <b class="customizer-number" data-preview-number data-position="${state.numberPosition}"></b>
            <img class="customizer-logo" data-preview-logo data-position="${state.logoPosition}" alt="Logo personalizado">
          </div>
        </div>
        <div class="customizer-view-toggle" aria-label="Vista del uniforme">
          <button type="button" data-view="front" aria-pressed="false">Frontal</button>
          <button type="button" data-view="back" aria-pressed="false">Posterior</button>
        </div>
        <p class="customizer__view-note">Frontal: logo · Posterior: nombre y número</p>
      </section>
      <div class="customizer__controls" tabindex="0" role="region" aria-label="Opciones de personalización">
        ${allowText ? `<fieldset class="customizer-group"><legend>Texto</legend><div class="customizer-fields">
          ${product.allow_name ? `<label>Nombre<input id="custom-name" maxlength="15" autocomplete="off" value="${escapeHtml(state.name)}" placeholder="TU NOMBRE"></label>` : ''}
          ${product.allow_number ? `<label>Número<input id="custom-number" maxlength="2" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(state.number)}" placeholder="10"></label>` : ''}
        </div></fieldset>` : ''}
        ${(product.allow_font || product.allow_text_color) ? `<fieldset class="customizer-group"><legend>Estilo</legend>
          ${product.allow_font ? `<label>Fuente<select id="custom-font">${selectOptions(Object.keys(FONT_MAP), state.font)}</select></label>` : ''}
          ${product.allow_text_color ? `<div class="customizer-color-field"><span>Color del texto</span><div class="customizer-colors">${TEXT_COLORS.map(([color, label]) => `<button type="button" data-text-color="${color}" style="--choice-color:${color}" aria-label="${label}" aria-pressed="false"><i></i><span>${label}</span></button>`).join('')}</div></div>` : ''}
        </fieldset>` : ''}
        ${allowText ? `<fieldset class="customizer-group"><legend>Posición posterior</legend><div class="customizer-fields">
          ${product.allow_name ? `<label>Nombre<select id="name-position">${positionOptions(state.namePosition)}</select></label>` : ''}
          ${product.allow_number ? `<label>Número<select id="number-position">${positionOptions(state.numberPosition)}</select></label>` : ''}
        </div></fieldset>` : ''}
        ${product.allow_logo ? `<fieldset class="customizer-group"><legend>Logo frontal</legend><input class="sr-only" id="custom-logo" type="file" accept="image/png,image/jpeg,image/webp"><div class="customizer-upload"><button class="btn btn--ghost" type="button" data-pick-logo>${state.logoUrl || state.logoFile ? 'Cambiar logo' : 'Subir logo'}</button><div class="customizer-upload__file" data-logo-file></div></div><label>Posición del logo<select id="logo-position">${positionOptions(state.logoPosition)}</select></label></fieldset>` : ''}
      </div>
    </div>
    <footer class="customizer__footer"><button class="btn btn--ghost" type="button" data-cancel-customization>Cancelar</button><button class="btn btn--primary" type="button" data-apply-customization>Aplicar personalización</button></footer>`;
}
