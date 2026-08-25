import { Highlight, themes, type PrismTheme } from 'prism-react-renderer'

const darkTheme: PrismTheme = { ...themes.vsDark, plain: { color: '#e6e8ee', backgroundColor: 'transparent' } }
const lightTheme: PrismTheme = { ...themes.github, plain: { color: '#14181f', backgroundColor: 'transparent' } }

function isLight(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light') return true
  if (attr === 'dark') return false
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false
}

export function CodeBlock({ code, numbered = false }: { code: string; numbered?: boolean }) {
  const theme = isLight() ? lightTheme : darkTheme
  return (
    <Highlight code={code} language="python" theme={theme}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre className="code">
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {numbered && <span className="ln">{i + 1}</span>}
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}
