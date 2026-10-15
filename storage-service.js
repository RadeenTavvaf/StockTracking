/* Browser-local persistence for this prototype. */
const StockStorage = (() => {
  const prefix = 'stocktracking:';

  return {
    load(name, fallback) {
      try {
        return JSON.parse(localStorage.getItem(`${prefix}${name}`)) ?? fallback;
      } catch (error) {
        return fallback;
      }
    },
    save(name, value) {
      try {
        localStorage.setItem(`${prefix}${name}`, JSON.stringify(value));
        return true;
      } catch (error) {
        return false;
      }
    }
  };
})();