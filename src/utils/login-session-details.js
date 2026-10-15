const ipaddr = require('ipaddr.js');

function ipType(value) {
  try {
    const ip = ipaddr.process(String(value || ''));
    const range = ip.range();
    return range === 'unicast' ? 'public' : range === 'loopback' ? 'loopback' : 'private';
  } catch {
    return 'unknown';
  }
}

function deviceDetails(value) {
  const ua = String(value || '');
  // Specific browser tokens precede Chrome/Safari compatibility tokens.
  const browsers = [['Edge', /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/], ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/], ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/], ['Safari', /Version\/([\d.]+).*Safari/]];
  const found = browsers.find(([, pattern]) => pattern.test(ua));
  const browser = found ? `${found[0]} ${ua.match(found[1])[1].split('.')[0]}` : 'Unknown browser';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' :
    /Windows/i.test(ua) ? 'Windows' : /CrOS/i.test(ua) ? 'ChromeOS' :
      /Macintosh|Mac OS X/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Unknown OS';
  return { browser, os };
}

function sessionDetails(row, user, now = new Date()) {
  let reason = null;
  if (!row.session_id || !row.expires_at || row.session_version == null) reason = 'not_tracked';
  else if (row.logged_out_at) reason = 'logged_out';
  else if (!user || Number(user.is_active) !== 1) reason = 'account_inactive';
  else if (Number(row.session_version) !== Number(user.permissions_version)) reason = 'credentials_changed';
  else if (new Date(row.expires_at).getTime() <= now.getTime()) reason = 'expired';
  return { session_status: reason === 'not_tracked' ? 'untracked' : reason ? 'inactive' : 'active', inactive_reason: reason };
}

module.exports = { ipType, deviceDetails, sessionDetails };
