fetch('https://softlybuilt.vercel.app/').then(r=>r.text()).then(html=>{ 
  const match = html.match(/src="(\/assets\/index-[^"]+\.js)"/); 
  if(match) { 
    fetch('https://softlybuilt.vercel.app'+match[1]).then(r=>r.text()).then(js=>{ 
      console.log('Found fetch cache buster:', js.includes('_t=')); 
    }); 
  } else {
    console.log('No JS bundle found');
  }
});
