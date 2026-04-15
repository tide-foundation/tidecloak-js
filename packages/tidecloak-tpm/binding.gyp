{
  "targets": [
    {
      "target_name": "tidecloak_tpm",
      "sources": ["src/tpm_binding.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "libraries": [
        "-ltss2-esys",
        "-ltss2-sys",
        "-ltss2-mu",
        "-ltss2-tcti-device",
        "-ltss2-tcti-mssim"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": ["-std=c++17"]
    }
  ]
}
