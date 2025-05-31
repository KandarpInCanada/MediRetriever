resource "aws_s3_bucket" "pdf_bucket" {
  bucket        = var.s3_bucket_name
  force_destroy = true
}

resource "aws_s3_object" "lambda_zip" {
  bucket = aws_s3_bucket.pdf_bucket.id
  key    = "lambda/lambda_deployment_package.zip"
  source = "${path.module}/lambda/lambda_deployment_package.zip"
  etag   = filemd5("${path.module}/lambda/lambda_deployment_package.zip")
}

resource "aws_iam_role" "lambda_exec_role" {
  name = "lambda_pdf_embedding_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "lambda_pdf_embedding_policy"
  role = aws_iam_role.lambda_exec_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Effect   = "Allow",
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "s3:GetObject"
        ],
        Resource = "${aws_s3_bucket.pdf_bucket.arn}/*"
      },
      {
        Effect   = "Allow",
        Action   = "sagemaker:InvokeEndpoint",
        Resource = "arn:aws:sagemaker:*:586794477720:endpoint/*"
      }
    ]
  })
}

# Attach AWS managed policy for Textract
resource "aws_iam_role_policy_attachment" "textract_policy" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonTextractFullAccess"
}

resource "aws_lambda_function" "pdf_lambda" {
  function_name = "pdfEmbeddingLambda"
  s3_bucket     = aws_s3_bucket.pdf_bucket.id
  s3_key        = aws_s3_object.lambda_zip.key
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  role          = aws_iam_role.lambda_exec_role.arn
  timeout       = 300  # Increased timeout for Textract processing
  memory_size   = 1024 # Increased memory for better performance
  environment {
    variables = {
      PINECONE_API_KEY    = var.pinecone_api_key
      PINECONE_ENV_REGION = var.pinecone_env_region
      PINECONE_INDEX      = var.pinecone_index
      EMBEDDING_DIMENSION = var.embedding_dim
      SAGEMAKER_ENDPOINT  = var.sagemaker_endpoint_name
    }
  }
}

resource "aws_lambda_permission" "allow_s3" {
  statement_id  = "AllowExecutionFromS3"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pdf_lambda.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.pdf_bucket.arn
}

resource "aws_s3_bucket_notification" "bucket_notification" {
  bucket = aws_s3_bucket.pdf_bucket.id
  lambda_function {
    lambda_function_arn = aws_lambda_function.pdf_lambda.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/"
    filter_suffix       = ".pdf"
  }
  depends_on = [aws_lambda_permission.allow_s3]
}
