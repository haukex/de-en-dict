/**
 * This LRU Cache class is based heavily on:
 * https://stackoverflow.com/a/46432113
 * by user "odinho - Velmont"
 */

export class LRUCache<K,V> {
  max :number
  cache :Map<K, V>
  constructor(max :number = 10) {
    this.max = max < 1 ? 1 : max
    this.cache = new Map<K, V>()
  }
  get(key :K) {
    const item = this.cache.get(key)
    if (item !== undefined) {
      // refresh key
      this.cache.delete(key)
      this.cache.set(key, item)
    }
    return item
  }
  set(key :K, val :V) {
    // refresh key
    if (this.cache.has(key)) this.cache.delete(key)
    // evict oldest
    else if (this.cache.size >= this.max) {
      // we know the cache will have at least one key here, but TypeScript doesn't
      const v = this.cache.keys().next().value
      if (v!==undefined) this.cache.delete(v)
    }
    this.cache.set(key, val)
  }
}