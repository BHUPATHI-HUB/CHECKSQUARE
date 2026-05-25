package com.bhupathi.checksquare;

import android.os.Bundle;
import android.view.View;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.ViewCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Disable edge-to-edge so the WebView doesn't draw under the status / navigation bars.
        // Capacitor 8 + targetSdk 35/36 enables edge-to-edge by default, which hides the status bar icons.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        // Apply system-bar insets as padding on the WebView root so content shifts below the status bar.
        View root = findViewById(android.R.id.content);
        if (root != null) {
            ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
                int top = insets.getInsets(WindowInsetsCompat.Type.systemBars()).top;
                int bottom = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
                int left = insets.getInsets(WindowInsetsCompat.Type.systemBars()).left;
                int right = insets.getInsets(WindowInsetsCompat.Type.systemBars()).right;
                v.setPadding(left, top, right, bottom);
                return insets;
            });
        }
    }
}
