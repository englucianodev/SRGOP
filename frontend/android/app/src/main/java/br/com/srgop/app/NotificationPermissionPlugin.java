package br.com.srgop.app;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

// Asks for the Android 13+ notification permission, so the persistent
// notification of the background GPS foreground service is visible.
// JavaScript calls requestPermissions() and reads the "notifications" state.
@CapacitorPlugin(
    name = "NotificationPermission",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = NotificationPermissionPlugin.ALIAS)
)
public class NotificationPermissionPlugin extends Plugin {

    static final String ALIAS = "notifications";

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        // Before Android 13 notifications need no runtime permission.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put(ALIAS, "granted");
            call.resolve(result);
            return;
        }
        super.requestPermissions(call);
    }
}
