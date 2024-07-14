
interface IFlagList { de: string[], en: string[] }

/* That these lists are off by one is kind of nice because it means
 * that eventually all pairs of flags will be shown. */
const FLAGS :IFlagList = { en: [ '🇺🇸', '🇬🇧', '🇦🇺', '🇳🇿' ], de: [ '🇩🇪', '🇦🇹', '🇨🇭' ] }

const INTERVAL_MS = 4000

export function init_flags () {
  ['de', 'en'].forEach(key => {
    const element = document.getElementById('flag-'+key) as HTMLElement
    // add the other flag <div>s
    FLAGS[key as keyof IFlagList].forEach((flagStr, i) => {
      if (!i) return  // the HTML already contains the <div> for the first flag
      const div = document.createElement('div')
      div.classList.add('flag-icon-inactive')
      div.innerText = flagStr
      element.appendChild(div)
    })
    // rotate through the flag <div>s, the CSS will crossfade the opacity
    let idx = 0  // pointer to keep track of which <div> is currently active
    setInterval(() => {
      const flags = element.children
      // change the currently active <div> to inactive
      const curDiv = flags.item(idx) as HTMLElement
      curDiv.classList.add('flag-icon-inactive')
      // update pointer and set next <div> to active
      idx = (idx+1)%flags.length
      const nextDiv = flags.item(idx) as HTMLElement
      nextDiv.classList.remove('flag-icon-inactive')
    }, INTERVAL_MS)
  })
}
