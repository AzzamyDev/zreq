import s from './AppPreview.module.css'

export default function AppPreview() {
  return (
    <div className={s.wrap} aria-hidden="true">
      <div className={s.glow} />
      <div className={s.window}>
        {/* Titlebar */}
        <div className={s.titlebar}>
          <span className={`${s.dot} ${s.dotR}`} />
          <span className={`${s.dot} ${s.dotY}`} />
          <span className={`${s.dot} ${s.dotG}`} />
          <span className={s.titleText}>ZReq — Users API</span>
        </div>

        <div className={s.body}>
          {/* Sidebar */}
          <aside className={s.sidebar}>
            <div className={s.sideSection}>Collections</div>
            <div className={`${s.sideItem} ${s.sideItemActive}`}>
              <span className={`${s.method} ${s.get}`}>GET</span>
              <span>Get Users</span>
            </div>
            <div className={s.sideItem}>
              <span className={`${s.method} ${s.post}`}>POST</span>
              <span>Create User</span>
            </div>
            <div className={s.sideItem}>
              <span className={`${s.method} ${s.put}`}>PUT</span>
              <span>Update User</span>
            </div>
            <div className={s.sideItem}>
              <span className={`${s.method} ${s.del}`}>DEL</span>
              <span>Delete User</span>
            </div>
            <div className={s.sideSection} style={{ marginTop: 12 }}>Auth</div>
            <div className={s.sideItem}>
              <span className={`${s.method} ${s.post}`}>POST</span>
              <span>Login</span>
            </div>
            <div className={s.sideItem}>
              <span className={`${s.method} ${s.get}`}>GET</span>
              <span>Refresh Token</span>
            </div>
          </aside>

          {/* Main pane */}
          <div className={s.main}>
            <div className={s.reqBar}>
              <span className={s.methodBadge}>GET</span>
              <span className={s.urlBar}>https://api.example.com/v1/users</span>
              <span className={s.sendBtn}>Send</span>
            </div>

            <div className={s.tabs}>
              {(['Params', 'Headers', 'Body', 'Response', 'Cookies'] as const).map((tab) => (
                <span
                  key={tab}
                  className={tab === 'Response' ? `${s.tab} ${s.tabActive}` : s.tab}
                >
                  {tab}
                </span>
              ))}
            </div>

            <div className={s.response}>
              <span className={s.jPunc}>{`{`}</span><br />
              &nbsp;&nbsp;<span className={s.jKey}>&quot;status&quot;</span>: <span className={s.jStr}>&quot;ok&quot;</span>,<br />
              &nbsp;&nbsp;<span className={s.jKey}>&quot;data&quot;</span>: [<br />
              &nbsp;&nbsp;&nbsp;&nbsp;{`{`}<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className={s.jKey}>&quot;id&quot;</span>: <span className={s.jNum}>1</span>,<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className={s.jKey}>&quot;name&quot;</span>: <span className={s.jStr}>&quot;Azzamy&quot;</span>,<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className={s.jKey}>&quot;role&quot;</span>: <span className={s.jStr}>&quot;admin&quot;</span>,<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className={s.jKey}>&quot;active&quot;</span>: <span className={s.jBool}>true</span><br />
              &nbsp;&nbsp;&nbsp;&nbsp;{`}`}<br />
              &nbsp;&nbsp;],<br />
              &nbsp;&nbsp;<span className={s.jKey}>&quot;total&quot;</span>: <span className={s.jNum}>1</span><br />
              <span className={s.jPunc}>{`}`}</span>
            </div>

            <div className={s.statusBar}>
              <span className={s.statusOk}>200 OK</span>
              <span>128 ms</span>
              <span>·</span>
              <span>1.2 KB</span>
              <span className={s.statusRight}>Content-Type: application/json</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
