# On-Device UI

Tap tiles to control devices, open folders, or view details. Configure the layout in the [Web Admin](web-admin.md).

<figure class="ht-screenshot">
<img src="../images/8in-home.png" alt="Home dashboard" width="1308" height="828" loading="lazy">
<figcaption>HomeTiles dashboard</figcaption>
</figure>

Every icon sits on a round circle, and a tile can take on its icon's color. Tiles and circles use the same corner radius, and half-height tiles show their title and value next to the icon. Colors, circles, and radius are set in the [Web Admin](web-admin.md#global-settings); [rules](web-admin.md#colors-and-rules) can color a tile by the state of an entity. Every tile type and its popup is shown under [Tile Types](tiles.md).

## Folders

Folders have their own grid. The back tile returns to the previous page.

<figure class="ht-screenshot">
<img src="../images/8in-folder-lighting.png" alt="Folder page with light tiles and scenes" width="1308" height="828" loading="lazy">
<figcaption>Folder with light tiles and scenes</figcaption>
</figure>

A protected folder asks for its PIN first; see [Folder](tiles.md#folder).

## Popups

For tiles with detail controls, choose a tap or long press as the popup trigger in the Web Admin. Popups take on the look of their tile: the header shows the tile's icon and circle, and most popups use the tile's color.

History popups have **24H** and **7D** views; the previous data stays visible until the new period arrives. To read an earlier value, touch a graph and move your finger along it, or tap an Energy bar. The time and value appear above the graph, and the marker stays where you let go.

Each type's popup is shown with its tile:

| Tile | Popup |
| --- | --- |
| [Sensor](tiles.md#sensor), [Binary Sensor](tiles.md#binary-sensor) | History graph or state timeline with Activity |
| [Number](tiles.md#number), [Select](tiles.md#select), [Date/Time](tiles.md#datetime) | Control above the history |
| [Energy](tiles.md#energy) | Hourly and daily bars |
| [Switch](tiles.md#switch) | Brightness, color, and color temperature for lights; on/off otherwise |
| [Cover](tiles.md#cover) | Position and tilt |
| [Weather](tiles.md#weather), [Media](tiles.md#media), [Climate](tiles.md#climate) | Forecast, playback, temperature and modes |
| [Camera](tiles.md#camera-experimental) | Live video |

Home Assistant can also open a folder or popup using the display's [View Select entity](bridge.md#control-the-displayed-view).

## Built-in Camera Indicator { data-toc-label="Camera indicator" }

While Home Assistant uses the display's own [built-in camera](bridge.md#built-in-camera), a red line runs along the top edge and a **Camera active** pill appears below it. Tap the pill to end the live stream; the camera stays available for the next request. Both parts can be switched off in the [Web Admin](web-admin.md#built-in-camera).

<figure class="ht-screenshot">
<img src="../images/8in-home-camera-active.png" alt="Red line and Camera active pill at the top of the dashboard" width="1308" height="828" loading="lazy">
<figcaption>The camera is in use by Home Assistant</figcaption>
</figure>

## Settings

The gear tile opens Settings.

<figure class="ht-screenshot">
<img src="../images/8in-settings.png" alt="Settings menu" width="1308" height="828" loading="lazy">
<figcaption>Device settings menu</figcaption>
</figure>

If Settings is PIN-protected, enter the PIN to open it. If its tile is hidden, swipe inward from the configured screen edge; the swipe also works while the tile is visible. The factory PIN **466384537** also unlocks protected folders; see [Settings access](web-admin.md#settings-tile-and-access).

### Display

Adjust brightness, sleep timeout, screensaver timeout, and screensaver brightness. **Never** disables the corresponding timeout. The rotate button turns the UI by 180°. **Background** puts a photo behind the tiles; see [Background photo](#background-photo).

<figure class="ht-screenshot">
<img src="../images/8in-display-popup.png" alt="Display settings with screensaver timeout" width="1272" height="792" loading="lazy">
<figcaption>Display and screensaver settings</figcaption>
</figure>

Tap a **Clock** tile to open the screensaver immediately. See [Screensaver](screensaver.md) for its layout and images.

### WiFi

Select a network and enter its password. The connected network is checked, and its IP address opens the [Web Admin](web-admin.md).

<figure class="ht-screenshot">
<img src="../images/8in-wifi-popup.png" alt="WiFi popup" width="1272" height="792" loading="lazy">
<figcaption>WiFi settings</figcaption>
</figure>

- **Disconnect:** stay offline until you reconnect or restart; saved credentials remain.
- **Enable AP:** connect through the display's hotspot and setup portal.
- **Manual:** enter the SSID and password with the on-screen keyboard.

<figure class="ht-screenshot">
<img src="../images/8in-wifi-connect.png" alt="Manual WiFi entry with on-screen keyboard" width="1272" height="792" loading="lazy">
<figcaption>WiFi entry with the on-screen keyboard</figcaption>
</figure>

### Localization

Choose English or German, time zone, date/time formats, and keyboard layout. Tile titles also support Cyrillic characters.

<figure class="ht-screenshot">
<img src="../images/8in-localization-popup.png" alt="Localization settings" width="1272" height="792" loading="lazy">
<figcaption>Language and regional settings</figcaption>
</figure>
<figure class="ht-screenshot">
<img src="../images/8in-settings-de.png" alt="Settings menu in German" width="1308" height="828" loading="lazy">
<figcaption>Device settings in German</figcaption>
</figure>

### System

View the firmware version and device name, or use the maintenance actions:

<figure class="ht-screenshot">
<img src="../images/8in-system-popup.png" alt="System popup" width="1272" height="792" loading="lazy">
<figcaption>System information and firmware update</figcaption>
</figure>

- **Check for updates:** find and install a new release; see [Firmware Updates](updating.md).
- **Restart:** reboot the display.
- **Pairing:** reconnect MQTT and announce the display to Home Assistant again.
- **GitHub:** show a QR code for the project.

## Background photo

One photo from the microSD card can sit behind every page, with see-through tiles on top. It needs microSD support, like the [screensaver images](screensaver.md#prepare-the-microsd-card).

1. Copy JPEG photos into the `/images` folder of a FAT32 card: with a card reader, or with the Web Admin [file manager](web-admin.md#file-manager) (local Web Admin only, not through the cloud remote).
2. Open Settings › Display › **Background**, tap **Photo** and pick a photo. **None** keeps the black background.
3. **Tile opacity** sets how solid the tiles are, from 0 to 100 % (60 % the first time a photo is chosen). **Dim photo** darkens the photo, from 0 to 60 % (default 25 %), so tile text stays readable. Both are grey while **None** is chosen.

The photo fills the screen, cropped to fit, and stands upright as the camera's EXIF orientation says. Popups, Settings, the PIN pad and the screensaver stay solid; the clock drops its card over a photo.

Photos the panel cannot show are greyed out in the list with the reason:

| Reason | Meaning |
| --- | --- |
| **Can’t use: progressive JPEG** | Save the photo as a baseline (standard) JPEG. |
| **Can’t use: over 8 MB** | The file is larger than 8 MB. |
| **Can’t use: over 4.2 MP** | The photo has more than 4.2 million pixels (2048 × 2048), like most phone photos; scale it down to 2048 pixels on the long side. |
| **Can’t use: not a readable JPEG** | The file is damaged or not a JPEG. |
| **Can’t use: file name** | The name is 64 bytes or longer; shorten it. |

Without the card, or when the chosen file is gone, the panel shows solid tiles on black and keeps the choice: the popup shows the name with **Not found** and the status says **No microSD card** or **Not found**. Put the card or the file back and restart the panel, or pick the photo again. **Not enough memory** means the photo could not be decoded; restart the panel.

The same three settings appear in the Web Admin [global settings](web-admin.md#global-settings), also through the cloud remote.
