class UploadController {
    @PostMapping("/upload")
    String upload(@RequestParam("file") MultipartFile file) throws Exception {
        String name = file.getOriginalFilename();
        // ruleid: seckit.upload-c2.spring-client-filename-in-path
        Path dest = uploadDir.resolve(name);
        // ruleid: seckit.upload-c2.spring-client-filename-in-path
        file.transferTo(new File("/srv/uploads/" + file.getOriginalFilename()));
        String stored = UUID.randomUUID() + ".png";
        // ok: seckit.upload-c2.spring-client-filename-in-path
        file.transferTo(uploadDir.resolve(stored));
        return "ok";
    }
}
