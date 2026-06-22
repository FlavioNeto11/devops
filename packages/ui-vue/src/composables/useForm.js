// useForm.js — estado de formulário + validação (anti-duplo-submit). Regras puras de validators.js.
// const f = useForm({ initial: {...}, rules: { campo: [required(), minLen(3)] } });
// f.values, f.errors, f.touched, f.submitting, f.setField, f.validate, f.handleSubmit(fn), f.reset()
import { reactive, ref } from 'vue';
import { runRules } from '../lib/validators.js';

export function useForm(config = {}) {
  const initial = config.initial || {};
  const rules = config.rules || {};
  const values = reactive({ ...initial });
  const errors = reactive({});
  const touched = reactive({});
  const submitting = ref(false);

  function validateField(key) {
    const msg = runRules(rules[key], values[key], values);
    if (msg) errors[key] = msg; else delete errors[key];
    return !msg;
  }
  function setField(key, value) { values[key] = value; touched[key] = true; if (errors[key]) validateField(key); }
  function validate() {
    let ok = true;
    for (const key of Object.keys(rules)) { touched[key] = true; if (!validateField(key)) ok = false; }
    return ok;
  }
  function reset() {
    for (const k of Object.keys(values)) delete values[k];
    Object.assign(values, { ...initial });
    for (const k of Object.keys(errors)) delete errors[k];
    for (const k of Object.keys(touched)) delete touched[k];
    submitting.value = false;
  }
  async function handleSubmit(fn) {
    if (submitting.value) return; // anti-duplo-submit
    if (!validate()) return;
    submitting.value = true;
    try { return await fn({ ...values }); }
    finally { submitting.value = false; }
  }
  return { values, errors, touched, submitting, setField, validateField, validate, handleSubmit, reset };
}
